import "server-only";
import type { UserRow } from "./users";
import { formatPrice, type Plan } from "@/lib/shared/billing-schema";
import type { Settings } from "@/lib/shared/settings-schema";
import { TIER_IDS, type PublicPlan } from "@/lib/shared/types";

/** Subscription states in which a plan is usable. A failed payment is retried, so "past_due" still counts. */
const ACTIVE_STATES = new Set(["active", "trialing", "past_due"]);

/** Access continues for a short while after the paid period, in case a renewal notice is delayed. */
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The paid plan a user is entitled to right now, or null for the free plan.
 * A plan that no longer exists, an inactive subscription or an expired period
 * all fall back to free.
 */
export function activePaidPlan(
  user: Pick<UserRow, "plan_id" | "plan_source" | "plan_status" | "plan_period_end">,
  settings: Settings,
  now = Date.now(),
): Plan | null {
  if (user.plan_id === "free" || user.plan_source === "none") return null;
  const plan = settings.billing.plans.find((candidate) => candidate.id === user.plan_id);
  if (!plan) return null;
  if (user.plan_period_end !== null && now > user.plan_period_end + GRACE_MS) return null;
  if (user.plan_source === "stripe" && !ACTIVE_STATES.has(user.plan_status ?? "")) return null;
  return plan;
}

export function publicPlan(
  user: Pick<UserRow, "plan_id" | "plan_source" | "plan_status" | "plan_period_end">,
  settings: Settings,
): PublicPlan {
  const plan = activePaidPlan(user, settings);
  return plan
    ? { id: plan.id, name: plan.name, paid: true }
    : { id: "free", name: settings.billing.freePlan.name, paid: false };
}

/** A plan as shown on the plan page and on the home page. */
export interface PlanCard {
  id: string;
  name: string;
  description: string;
  paid: boolean;
  /** Formatted monthly price, for example "€7.99"; null for the free plan. */
  price: string | null;
  highlighted: boolean;
  /** What each model allows, one line per model. */
  limits: string[];
  features: string[];
}

function count(value: number, noun: string): string {
  return `${value.toLocaleString("en-US")} ${noun}${value === 1 ? "" : "s"}`;
}

/** The free plan followed by every paid plan that can currently be bought. */
export function planCards(settings: Settings): PlanCard[] {
  const tiers = TIER_IDS.filter((id) => settings.tiers[id].enabled);
  const { billing } = settings;
  const free: PlanCard = {
    id: "free",
    name: billing.freePlan.name,
    description: billing.freePlan.description,
    paid: false,
    price: null,
    highlighted: false,
    limits: tiers
      .filter((id) => settings.tiers[id].dailyLimit > 0)
      .map((id) => `${settings.tiers[id].label}: ${count(settings.tiers[id].dailyLimit, "message")} per day`),
    features: billing.freePlan.features,
  };
  const paid = billing.plans
    .filter((plan) => plan.enabled)
    .map<PlanCard>((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      paid: true,
      price: formatPrice(plan.priceCents, billing.currency),
      highlighted: plan.highlighted,
      limits: tiers
        .filter((id) => plan.limits[id].fiveHour > 0 && plan.limits[id].weekly > 0)
        .map(
          (id) =>
            `${settings.tiers[id].label}: ${count(plan.limits[id].fiveHour, "message")} every 5 hours, ${plan.limits[id].weekly.toLocaleString("en-US")} per week`,
        ),
      features: plan.features,
    }));
  return [free, ...paid];
}
