import { z } from "zod";
import {
  describeUpstreamError,
  generateTitle,
  noteUpstreamError,
  streamReply,
  type UpstreamErrorInfo,
} from "@/lib/server/ai";
import { apiUser } from "@/lib/server/auth";
import { selectContext } from "@/lib/server/context";
import {
  appendMessage,
  createConversation,
  dropTrailingAssistantMessages,
  getConversation,
  listMessageRows,
  renameConversation,
  setContextStart,
  titleFromMessage,
  toChatMessage,
  touchConversation,
  type ConversationRow,
} from "@/lib/server/conversations";
import { env } from "@/lib/server/env";
import { ApiError, readJson, route } from "@/lib/server/http";
import { buildSystemPrompt } from "@/lib/server/prompt";
import { rateLimit } from "@/lib/server/ratelimit";
import { getSettings } from "@/lib/server/settings";
import {
  assertWithinQuota,
  dailyRequestCeiling,
  estimateTokens,
  publicTier,
  recordUsage,
  releaseUsage,
  reserveUsage,
  settleUsage,
  utcDay,
} from "@/lib/server/usage";
import type { UserRow } from "@/lib/server/users";
import type { Settings } from "@/lib/shared/settings-schema";
import {
  TIER_IDS,
  type ChatStreamEvent,
  type MessageStatus,
  type TierId,
} from "@/lib/shared/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().min(1).max(64).optional(),
  message: z.string().max(400_000).optional(),
  tier: z.enum(TIER_IDS),
  regenerate: z.boolean().optional(),
});

/** One response at a time per user; entries older than the cut-off are stale. */
const LOCK_STALE_MS = 10 * 60_000;
const locks = ((globalThis as unknown as { __lishiaChatLocks?: Map<string, number> })
  .__lishiaChatLocks ??= new Map<string, number>());

function acquireLock(userId: string): number {
  const startedAt = locks.get(userId);
  if (startedAt && Date.now() - startedAt < LOCK_STALE_MS) {
    throw new ApiError(409, "already_generating", "Please wait for the current response to finish.");
  }
  // The timestamp doubles as a token so a lock is only released by its owner.
  let token = Date.now();
  if (token === startedAt) token += 1;
  locks.set(userId, token);
  return token;
}

function releaseLock(userId: string, token: number): void {
  if (locks.get(userId) === token) locks.delete(userId);
}

export const POST = route(async (request) => {
  const { user } = await apiUser();
  const settings = getSettings();
  const input = await readJson(request, bodySchema, settings.maxMessageChars * 4 + 4_000);

  const burst = rateLimit(`chat:${user.id}`, 20, 60_000);
  if (!burst.ok) {
    throw new ApiError(429, "rate_limited", "You are sending messages too quickly. Please slow down.", burst.retryAfter);
  }
  // A generous ceiling on requests per day, whatever their outcome. Requests
  // that fail at the provider are refunded, and this keeps even those bounded.
  const daily = rateLimit(`chat-day:${user.id}`, dailyRequestCeiling(user, settings), 24 * 60 * 60_000);
  if (!daily.ok) {
    throw new ApiError(429, "rate_limited", "You have sent too many requests today. Please try again tomorrow.", daily.retryAfter);
  }

  const regenerate = input.regenerate === true;
  const text = (input.message ?? "").trim();
  if (!regenerate) {
    if (!text) throw new ApiError(400, "empty_message", "Please enter a message.");
    if (text.length > settings.maxMessageChars) {
      throw new ApiError(
        400,
        "message_too_long",
        `Your message is too long. The maximum is ${settings.maxMessageChars.toLocaleString("en-US")} characters.`,
      );
    }
  } else if (!input.conversationId) {
    throw new ApiError(400, "invalid_request", "There is nothing to regenerate.");
  }

  if (!env.aiKeyConfigured) {
    throw new ApiError(503, "unavailable", "The assistant is not available yet. Please try again later.");
  }

  // From here to the reservation below nothing is awaited, so two requests of
  // the same user can never both pass the allowance check.
  assertWithinQuota(user, input.tier, settings);
  const lock = acquireLock(user.id);
  let reservation: number | null = null;

  try {
    let conversation: ConversationRow;
    let created = false;
    if (input.conversationId) {
      const existing = getConversation(user.id, input.conversationId);
      if (!existing) throw new ApiError(404, "not_found", "This conversation does not exist.");
      conversation = existing;
    } else {
      conversation = createConversation(user.id, titleFromMessage(text), input.tier);
      created = true;
    }

    let userMessageId: string | null = null;
    if (regenerate) {
      if (!dropTrailingAssistantMessages(conversation.id)) {
        throw new ApiError(400, "invalid_request", "There is nothing to regenerate.");
      }
    } else {
      userMessageId = appendMessage(conversation.id, {
        role: "user",
        content: text,
        tier: input.tier,
      }).id;
    }

    // Only the part of the conversation that can still be sent is read.
    const tier = settings.tiers[input.tier];
    const rows = listMessageRows(conversation.id, conversation.context_start_seq);
    const context = selectContext(rows, conversation.context_start_seq, tier.contextChars);
    if (context.startSeq !== conversation.context_start_seq) {
      setContextStart(conversation.id, context.startSeq);
    }
    const system = buildSystemPrompt(settings, tier, utcDay());
    const promptChars =
      system.length + context.messages.reduce((sum, row) => sum + row.content.length, 0);

    // The message is booked now: it counts whatever happens to the reply.
    reservation = reserveUsage({ userId: user.id, tierId: input.tier, tier, promptChars });

    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort(), { once: true });
    const options: GenerateOptions = {
      abort,
      lock,
      reservation,
      user,
      settings,
      tierId: input.tier,
      conversation,
      userMessageId,
      firstMessage: created ? text : null,
      system,
      promptChars,
      upstreamMessages: context.messages.map((row) => ({ role: row.role, content: row.content })),
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void generate(controller, options);
      },
      cancel() {
        abort.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (reservation !== null) releaseUsage(reservation);
    releaseLock(user.id, lock);
    throw error;
  }
});

interface GenerateOptions {
  abort: AbortController;
  lock: number;
  reservation: number;
  user: UserRow;
  settings: Settings;
  tierId: TierId;
  conversation: ConversationRow;
  userMessageId: string | null;
  /** Set for a brand-new conversation, which then gets a generated title. */
  firstMessage: string | null;
  system: string;
  promptChars: number;
  upstreamMessages: { role: "user" | "assistant"; content: string }[];
}

async function generate(
  controller: ReadableStreamDefaultController<Uint8Array>,
  options: GenerateOptions,
): Promise<void> {
  const { abort, user, settings, tierId, conversation } = options;
  const tier = settings.tiers[tierId];
  const encoder = new TextEncoder();
  let open = true;

  const write = (chunk: string) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      open = false; // the client went away
    }
  };
  const send = (event: ChatStreamEvent) => write(`data: ${JSON.stringify(event)}\n\n`);
  // Comment lines keep intermediaries from closing an idle connection.
  const heartbeat = setInterval(() => write(": keep-alive\n\n"), 15_000);

  let text = "";

  try {
    send({
      type: "meta",
      conversationId: conversation.id,
      title: conversation.title,
      userMessageId: options.userMessageId,
    });

    const result = await streamReply({
      tier,
      system: options.system,
      messages: options.upstreamMessages,
      signal: abort.signal,
      onText: (delta) => {
        text += delta;
        send({ type: "delta", text: delta });
      },
    });

    let failure: UpstreamErrorInfo | null = null;
    if (result.status === "failed") {
      failure = describeUpstreamError(result.error);
      noteUpstreamError(failure);
      console.error(`[chat] upstream failure (${tierId}): ${failure.adminNote}`);
    }

    if (result.status === "failed" && !result.started) {
      // The provider rejected the request or was unreachable: nothing was
      // generated and nothing is billed, so the message is not counted.
      releaseUsage(options.reservation);
    } else {
      const usage = { ...result.usage };
      if (result.status === "stopped" || result.status === "failed") {
        // The final numbers never arrived. Fall back to estimates so that a
        // cancelled reply is neither free nor invisible to the daily budget.
        if (usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens === 0) {
          usage.inputTokens = estimateTokens(options.promptChars);
        }
        usage.outputTokens = Math.max(usage.outputTokens, estimateTokens(result.producedChars));
      }
      settleUsage(options.reservation, tier, usage);
    }

    let status: MessageStatus = result.status === "failed" ? "error" : result.status;
    let content = text;
    if (status === "refused") content = ""; // a declined reply is discarded entirely
    if (status === "complete" && !content.trim()) status = "error";

    // A reply that was stopped before any text arrived leaves nothing to keep.
    const keep = !(status === "stopped" && !content.trim());
    const stored = keep
      ? appendMessage(conversation.id, { role: "assistant", content, tier: tierId, status })
      : null;
    touchConversation(conversation.id, tierId);

    if (failure) send({ type: "error", code: failure.code, message: failure.message });
    send({
      type: "done",
      message: stored ? toChatMessage(stored) : null,
      tier: publicTier(user, tierId, settings),
    });
    // The reply is finished: the user may send the next message right away.
    releaseLock(user.id, options.lock);

    // Give a new conversation a proper title, using the most economical model.
    if (options.firstMessage && status === "complete" && !abort.signal.aborted) {
      const lite = settings.tiers.lite;
      const { title, usage } = await generateTitle(lite, options.firstMessage);
      if (usage.inputTokens > 0 || usage.outputTokens > 0) {
        recordUsage({ userId: user.id, kind: "title", tierId: "lite", tier: lite, usage });
      }
      if (title && renameConversation(user.id, conversation.id, title)) {
        send({ type: "title", title });
      }
    }
  } catch (error) {
    // The reservation is deliberately left in place: an unexpected failure
    // must never turn into a free message.
    console.error("[chat] failed to finish response:", error);
    send({ type: "error", code: "internal_error", message: "Something went wrong. Please try again." });
  } finally {
    clearInterval(heartbeat);
    releaseLock(user.id, options.lock);
    if (open) {
      try {
        controller.close();
      } catch {
        // already closed
      }
    }
  }
}
