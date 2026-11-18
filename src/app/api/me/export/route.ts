import { apiUser } from "@/lib/server/auth";
import {
  getConversation,
  listConversationIds,
  listMessageRows,
  toChatMessage,
  toSummary,
} from "@/lib/server/conversations";
import { getDb } from "@/lib/server/db";
import { ApiError, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Data portability: everything stored about the signed-in user, as JSON.
 * The file is produced one conversation at a time, so even a very large
 * history never has to be held in memory as a whole.
 */
export const GET = route(async () => {
  const { user } = await apiUser();
  const limit = rateLimit(`export:${user.id}`, 5, 60 * 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", "Please wait before requesting another export.", limit.retryAfter);
  }

  const usage = getDb()
    .prepare(
      `SELECT day, tier, COUNT(*) AS requests, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens
         FROM usage_events WHERE user_id = ? GROUP BY day, tier ORDER BY day`,
    )
    .all(user.id);
  const head = JSON.stringify({
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      name: user.name,
      createdAt: new Date(user.created_at).toISOString(),
      termsVersion: user.terms_version,
      termsAcceptedAt: user.terms_accepted_at ? new Date(user.terms_accepted_at).toISOString() : null,
    },
    usage,
  });

  const ids = listConversationIds(user.id);
  const encoder = new TextEncoder();
  let position = -1;
  let written = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (position === -1) {
        // `head` is a complete object; reopen it to append the conversations.
        controller.enqueue(encoder.encode(`${head.slice(0, -1)},"conversations":[`));
        position = 0;
        return;
      }
      while (position < ids.length) {
        const conversation = getConversation(user.id, ids[position]!);
        position += 1;
        if (!conversation) continue; // deleted while the export was running
        const entry = JSON.stringify({
          ...toSummary(conversation),
          messages: listMessageRows(conversation.id).map(toChatMessage),
        });
        controller.enqueue(encoder.encode(`${written > 0 ? "," : ""}${entry}`));
        written += 1;
        return;
      }
      controller.enqueue(encoder.encode("]}"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="account-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
