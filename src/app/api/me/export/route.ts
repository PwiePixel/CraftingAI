import { apiUser } from "@/lib/server/auth";
import { listConversations, listMessageRows, toChatMessage } from "@/lib/server/conversations";
import { getDb } from "@/lib/server/db";
import { ApiError, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** Data portability: everything stored about the signed-in user, as JSON. */
export const GET = route(async () => {
  const { user } = await apiUser();
  const limit = rateLimit(`export:${user.id}`, 5, 60 * 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", "Please wait before requesting another export.", limit.retryAfter);
  }
  const conversations = listConversations(user.id, 100_000).map((conversation) => ({
    ...conversation,
    messages: listMessageRows(conversation.id).map(toChatMessage),
  }));
  const usage = getDb()
    .prepare(
      `SELECT day, tier, COUNT(*) AS requests, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens
         FROM usage_events WHERE user_id = ? GROUP BY day, tier ORDER BY day`,
    )
    .all(user.id);
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        name: user.name,
        createdAt: new Date(user.created_at).toISOString(),
        termsVersion: user.terms_version,
        termsAcceptedAt: user.terms_accepted_at
          ? new Date(user.terms_accepted_at).toISOString()
          : null,
      },
      conversations,
      usage,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="account-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
