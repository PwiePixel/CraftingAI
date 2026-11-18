import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { TierSettings } from "@/lib/shared/settings-schema";
import { emptyUsage, type UpstreamUsage } from "./usage";

type Store = {
  __lishiaAi?: Anthropic;
  __lishiaAiStatus?: UpstreamStatus;
};
const store = globalThis as unknown as Store;

function client(): Anthropic {
  // Credentials are read from the server environment and never leave the server.
  store.__lishiaAi ??= new Anthropic({ maxRetries: 2, timeout: 5 * 60_000 });
  return store.__lishiaAi;
}

export type UpstreamMessage = { role: "user" | "assistant"; content: string };
export type FinishStatus = "complete" | "truncated" | "refused" | "stopped" | "failed";

export interface StreamResult {
  status: FinishStatus;
  /** Token counts as reported by the provider; zero where nothing was reported. */
  usage: UpstreamUsage;
  /** True once the provider has started to answer, i.e. the request is billable. */
  started: boolean;
  /** Characters of reply text received, for estimating usage that was never reported. */
  producedChars: number;
  /** Set when `status` is "failed". */
  error?: unknown;
}

/** Health of the upstream connection, shown on the admin dashboard only. */
export interface UpstreamStatus {
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
}

export function upstreamStatus(): UpstreamStatus {
  store.__lishiaAiStatus ??= { lastSuccessAt: null, lastErrorAt: null, lastError: null };
  return store.__lishiaAiStatus;
}

interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function applyUsage(target: UpstreamUsage, source: UsageLike | null | undefined): void {
  if (!source) return;
  if (typeof source.input_tokens === "number") target.inputTokens = source.input_tokens;
  if (typeof source.output_tokens === "number") target.outputTokens = source.output_tokens;
  if (typeof source.cache_read_input_tokens === "number") {
    target.cacheReadTokens = source.cache_read_input_tokens;
  }
  if (typeof source.cache_creation_input_tokens === "number") {
    target.cacheWriteTokens = source.cache_creation_input_tokens;
  }
}

/**
 * When a request was served in several attempts (for example after a fallback
 * to a substitute model), every attempt is billed. The per-attempt list is the
 * authoritative record; the top-level numbers only cover the final attempt.
 */
function applyFinalUsage(
  target: UpstreamUsage,
  source: (UsageLike & { iterations?: readonly unknown[] | null }) | null | undefined,
): void {
  if (!source) return;
  const attempts = (source.iterations ?? []).filter(
    (entry): entry is UsageLike => typeof entry === "object" && entry !== null,
  );
  if (attempts.length === 0) {
    applyUsage(target, source);
    return;
  }
  const sum = (pick: (entry: UsageLike) => number | null | undefined) =>
    attempts.reduce((total, entry) => total + (pick(entry) ?? 0), 0);
  target.inputTokens = sum((entry) => entry.input_tokens);
  target.outputTokens = sum((entry) => entry.output_tokens);
  target.cacheReadTokens = sum((entry) => entry.cache_read_input_tokens);
  target.cacheWriteTokens = sum((entry) => entry.cache_creation_input_tokens);
}

function finishStatus(stopReason: string | null): FinishStatus {
  switch (stopReason) {
    case "refusal":
      return "refused";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "truncated";
    default:
      return "complete";
  }
}

export interface StreamOptions {
  tier: TierSettings;
  system: string;
  messages: UpstreamMessage[];
  signal: AbortSignal;
  onText: (text: string) => void;
}

/** Models for which the optional fallback was rejected; not asked again until restart. */
const fallbackUnsupported = ((globalThis as unknown as { __lishiaNoFallback?: Set<string> })
  .__lishiaNoFallback ??= new Set<string>());

/**
 * Streams one assistant reply. Text is passed to `onText` as it arrives.
 * Never throws: upstream failures resolve with status "failed", cancellation
 * through `signal` with status "stopped".
 */
export async function streamReply(options: StreamOptions): Promise<StreamResult> {
  const { tier, signal } = options;
  const withFallback = tier.refusalFallback && !fallbackUnsupported.has(tier.model);

  let result = await runStream(options, withFallback);
  // The server-side fallback is an opt-in beta. A model or account that does
  // not accept it rejects the request before producing anything, so the
  // request can safely be sent once more without the option.
  if (
    withFallback &&
    result.status === "failed" &&
    !result.started &&
    result.error instanceof Anthropic.BadRequestError &&
    !signal.aborted
  ) {
    result = await runStream(options, false);
    if (result.status !== "failed") fallbackUnsupported.add(tier.model);
  }
  if (result.status !== "failed" && result.status !== "stopped") {
    upstreamStatus().lastSuccessAt = Date.now();
  }
  return result;
}

async function runStream(options: StreamOptions, withFallback: boolean): Promise<StreamResult> {
  const { tier, system, messages, signal, onText } = options;
  const usage = emptyUsage();
  let started = false;
  let producedChars = 0;

  const params = {
    model: tier.model,
    max_tokens: tier.maxOutputTokens,
    system,
    messages,
    // Caches the conversation prefix so follow-up messages cost a fraction.
    cache_control: { type: "ephemeral" as const },
    ...(tier.effort !== "default" ? { output_config: { effort: tier.effort } } : {}),
  };

  try {
    const stream = withFallback
      ? client().beta.messages.stream(
          { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" },
          { signal },
        )
      : client().messages.stream(params, { signal });

    for await (const event of stream) {
      if (event.type === "message_start") {
        started = true;
        applyUsage(usage, event.message.usage);
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          producedChars += event.delta.text.length;
          onText(event.delta.text);
        }
      } else if (event.type === "message_delta") {
        applyUsage(usage, event.usage);
      }
    }
    const final = await stream.finalMessage();
    applyFinalUsage(usage, final.usage);
    return { status: finishStatus(final.stop_reason), usage, started: true, producedChars };
  } catch (error) {
    if (signal.aborted || error instanceof Anthropic.APIUserAbortError) {
      return { status: "stopped", usage, started, producedChars };
    }
    return { status: "failed", usage, started, producedChars, error };
  }
}

/** Asks the fast model for a short conversation title. Returns null on any problem. */
export async function generateTitle(
  tier: TierSettings,
  firstMessage: string,
): Promise<{ title: string | null; usage: UpstreamUsage }> {
  const usage = emptyUsage();
  try {
    const response = await client().messages.create(
      {
        model: tier.model,
        // Leaves room for the model's internal reasoning before the title.
        max_tokens: 400,
        ...(tier.effort !== "default" ? { output_config: { effort: "low" as const } } : {}),
        system:
          "You write titles for conversations. Reply with a specific title of at most six words that describes the conversation opened by the message below. Use the language of the message. Output only the title: no quotation marks, no trailing punctuation, no explanations.",
        messages: [
          {
            role: "user",
            content: `Opening message of the conversation:\n"""\n${firstMessage.slice(0, 1500)}\n"""\n\nWrite the title.`,
          },
        ],
      },
      { timeout: 20_000, maxRetries: 0 },
    );
    applyUsage(usage, response.usage);
    if (response.stop_reason === "refusal") return { title: null, usage };
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ");
    const title = text
      .replace(/[\r\n]+/g, " ")
      .replace(/^["'“”‘’`\s]+|["'“”‘’`\s.]+$/g, "")
      .trim()
      .slice(0, 80);
    return { title: title || null, usage };
  } catch (error) {
    console.warn("[ai] title generation failed:", describeUpstreamError(error).adminNote);
    return { title: null, usage };
  }
}

export interface UpstreamErrorInfo {
  code: string;
  /** Safe to show to end users: never contains provider details. */
  message: string;
  /** For server logs and the admin dashboard. */
  adminNote: string;
}

const BUSY = "The service is very busy right now. Please try again in a moment.";
const UNAVAILABLE = "The assistant is temporarily unavailable. Please try again later.";

export function describeUpstreamError(error: unknown): UpstreamErrorInfo {
  if (error instanceof Anthropic.RateLimitError) {
    return { code: "busy", message: BUSY, adminNote: "429 rate limited by the AI provider" };
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return {
      code: "unavailable",
      message: UNAVAILABLE,
      adminNote: `${error.status} the AI provider rejected the API key (check the key and its permissions)`,
    };
  }
  if (error instanceof Anthropic.PaymentRequiredError) {
    return {
      code: "unavailable",
      message: UNAVAILABLE,
      adminNote: "402 billing problem with the AI provider account (check credits)",
    };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return {
      code: "unavailable",
      message: UNAVAILABLE,
      adminNote: "404 model not found (check the upstream model identifier of this tier)",
    };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return {
      code: "bad_request",
      message:
        "This request could not be processed. Try shortening your message or starting a new chat.",
      adminNote: `400 invalid request: ${error.type ?? "unknown"}`,
    };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return {
      code: "unavailable",
      message: UNAVAILABLE,
      adminNote: "network error while contacting the AI provider",
    };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      code: "busy",
      message: BUSY,
      adminNote: `${error.status ?? "?"} ${error.type ?? "upstream error"}`,
    };
  }
  return {
    code: "internal_error",
    message: "Something went wrong. Please try again.",
    adminNote: error instanceof Error ? `internal: ${error.name}` : "internal error",
  };
}

export function noteUpstreamError(info: UpstreamErrorInfo): void {
  const status = upstreamStatus();
  status.lastErrorAt = Date.now();
  status.lastError = info.adminNote;
}
