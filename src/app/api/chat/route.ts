import { z } from "zod";
import {
  describeUpstreamError,
  generateTitle,
  noteUpstreamError,
  streamReply,
  type StreamResult,
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
import { assertWithinQuota, publicTier, recordUsage, utcDay } from "@/lib/server/usage";
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
const locks = ((globalThis as unknown as { __craftingChatLocks?: Map<string, number> })
  .__craftingChatLocks ??= new Map<string, number>());

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
  assertWithinQuota(user, input.tier, settings);
  const lock = acquireLock(user.id);

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

    const rows = listMessageRows(conversation.id);
    const tier = settings.tiers[input.tier];
    const context = selectContext(rows, conversation.context_start_seq, tier.contextChars);
    if (context.startSeq !== conversation.context_start_seq) {
      setContextStart(conversation.id, context.startSeq);
    }

    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort(), { once: true });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void generate({
          controller,
          abort,
          lock,
          user,
          settings,
          tierId: input.tier,
          conversation,
          created,
          userMessageId,
          firstMessage: created ? text : null,
          upstreamMessages: context.messages.map((row) => ({
            role: row.role,
            content: row.content,
          })),
        });
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
    releaseLock(user.id, lock);
    throw error;
  }
});

interface GenerateOptions {
  controller: ReadableStreamDefaultController<Uint8Array>;
  abort: AbortController;
  lock: number;
  user: UserRow;
  settings: Settings;
  tierId: TierId;
  conversation: ConversationRow;
  created: boolean;
  userMessageId: string | null;
  firstMessage: string | null;
  upstreamMessages: { role: "user" | "assistant"; content: string }[];
}

async function generate(options: GenerateOptions): Promise<void> {
  const { controller, abort, user, settings, tierId, conversation } = options;
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
  let result: StreamResult | null = null;
  let failure: UpstreamErrorInfo | null = null;

  try {
    send({
      type: "meta",
      conversationId: conversation.id,
      title: conversation.title,
      userMessageId: options.userMessageId,
    });

    try {
      result = await streamReply({
        tier,
        system: buildSystemPrompt(settings, tier, utcDay()),
        messages: options.upstreamMessages,
        signal: abort.signal,
        onText: (delta) => {
          text += delta;
          send({ type: "delta", text: delta });
        },
      });
    } catch (error) {
      failure = describeUpstreamError(error);
      noteUpstreamError(failure);
      console.error(`[chat] upstream failure (${tierId}): ${failure.adminNote}`);
    }

    if (result?.billed) {
      recordUsage({ userId: user.id, kind: "chat", tierId, tier, usage: result.usage });
    }

    let status: MessageStatus = failure ? "error" : (result?.status ?? "error");
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
    if (options.created && options.firstMessage && status === "complete" && !abort.signal.aborted) {
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
