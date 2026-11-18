import { apiUser } from "@/lib/server/auth";
import { createPortal } from "@/lib/server/billing";
import { ApiError, json, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

/** Returns the address of the payment provider's page for invoices and payment methods. */
export const POST = route(async () => {
  const { user } = await apiUser();
  const limit = rateLimit(`portal:${user.id}`, 20, 60 * 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", "Too many attempts. Please try again later.", limit.retryAfter);
  }
  return json({ url: await createPortal(user) });
});
