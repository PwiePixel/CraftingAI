import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { billingConfigured, createCheckout } from "@/lib/server/billing";
import { ApiError, json, readJson, route } from "@/lib/server/http";
import { activePaidPlan } from "@/lib/server/plans";
import { rateLimit } from "@/lib/server/ratelimit";
import { getSettings } from "@/lib/server/settings";

const schema = z.object({ planId: z.string().min(1).max(40) });

/** Starts the checkout for a paid plan and returns the address of the payment page. */
export const POST = route(async (request) => {
  const { user } = await apiUser();
  const input = await readJson(request, schema);
  const limit = rateLimit(`checkout:${user.id}`, 10, 60 * 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", "Too many attempts. Please try again later.", limit.retryAfter);
  }

  const settings = getSettings();
  const plan = settings.billing.plans.find((candidate) => candidate.id === input.planId);
  if (!plan || !plan.enabled) throw new ApiError(404, "not_found", "This plan is not available.");
  if (!billingConfigured()) {
    throw new ApiError(503, "billing_unavailable", "Payments are not available yet. Please try again later.");
  }
  if (activePaidPlan(user, settings)?.id === plan.id) {
    throw new ApiError(409, "already_subscribed", "You are already on this plan.");
  }
  if (user.plan_source === "manual" && activePaidPlan(user, settings)) {
    throw new ApiError(409, "plan_assigned", "Your plan was assigned by the site team and cannot be changed here.");
  }
  return json({ url: await createCheckout(user, plan) });
});
