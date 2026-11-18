import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { setCancelAtPeriodEnd } from "@/lib/server/billing";
import { ApiError, clientIp, json, readJson, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

const schema = z.object({ cancel: z.boolean() });

/**
 * Cancels the subscription at the end of the paid period (`cancel: true`) or
 * takes a scheduled cancellation back (`cancel: false`).
 */
export const POST = route(async (request) => {
  const { user } = await apiUser();
  const input = await readJson(request, schema);
  const limit = rateLimit(`cancel:${user.id}`, 20, 60 * 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", "Too many attempts. Please try again later.", limit.retryAfter);
  }
  await setCancelAtPeriodEnd(user, input.cancel);
  audit({
    action: input.cancel ? "billing.cancel_scheduled" : "billing.cancel_withdrawn",
    actor: user,
    target: user.id,
    ip: clientIp(request),
  });
  return json({ ok: true });
});
