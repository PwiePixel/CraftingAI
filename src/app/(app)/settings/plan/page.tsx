import type { Metadata } from "next";
import { PlanSection } from "@/components/settings/plan-section";
import { requireUser } from "@/lib/server/auth";
import { billingConfigured } from "@/lib/server/billing";
import { activePaidPlan, planCards } from "@/lib/server/plans";
import { getSettings } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Plan" };

type Props = { searchParams: Promise<{ checkout?: string | string[] }> };

export default async function PlanPage({ searchParams }: Props) {
  const { user } = await requireUser();
  const settings = getSettings();
  const raw = (await searchParams).checkout;
  const checkout = Array.isArray(raw) ? raw[0] : raw;
  const active = activePaidPlan(user, settings);

  // Someone on a plan that is no longer sold still sees it as their current plan.
  const cards = planCards(settings);
  if (active && !cards.some((card) => card.id === active.id)) {
    const withRetired = planCards({
      ...settings,
      billing: {
        ...settings.billing,
        plans: settings.billing.plans.map((plan) => (plan.id === active.id ? { ...plan, enabled: true } : plan)),
      },
    });
    cards.push(withRetired.find((card) => card.id === active.id)!);
  }

  return (
    <PlanSection
      plans={cards}
      billingAvailable={billingConfigured()}
      checkout={checkout === "success" || checkout === "cancelled" ? checkout : null}
      state={{
        currentId: active?.id ?? "free",
        source: active ? user.plan_source : "none",
        status: user.plan_status,
        periodEnd: user.plan_period_end,
        cancelAtPeriodEnd: user.plan_cancel_at_period_end === 1,
        hasBillingAccount: Boolean(user.stripe_customer_id),
      }}
    />
  );
}
