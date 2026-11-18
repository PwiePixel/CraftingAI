"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, CardHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/shared/cn";
import type { PlanCard } from "@/lib/server/plans";

export interface PlanState {
  /** Identifier of the plan in effect ("free" or a paid plan). */
  currentId: string;
  /** "stripe" when the user pays for it, "manual" when the site team assigned it. */
  source: "none" | "manual" | "stripe";
  status: string | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  hasBillingAccount: boolean;
}

export function PlanSection({
  plans,
  state,
  billingAvailable,
  checkout,
}: {
  plans: PlanCard[];
  state: PlanState;
  billingAvailable: boolean;
  checkout: "success" | "cancelled" | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const current = plans.find((plan) => plan.id === state.currentId) ?? plans[0]!;
  const subscribed = state.source === "stripe" && current.paid;
  const waitingForPayment = checkout === "success" && !subscribed;

  // After paying, the confirmation from the payment provider can take a moment.
  useEffect(() => {
    if (!waitingForPayment) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 45_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [waitingForPayment, router]);

  async function go(key: string, path: string, body?: unknown) {
    setBusy(key);
    try {
      const result = await api<{ url: string }>(path, { method: "POST", body });
      window.location.assign(result.url); // continue on the payment provider's page
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(null);
    }
  }

  async function setCancel(cancel: boolean) {
    setBusy("cancel");
    try {
      await api("/api/billing/cancel", { body: { cancel } });
      toast.success(cancel ? "Your plan will end with the current period." : "Your plan continues.");
      setConfirmCancel(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {checkout === "success" ? (
        <Alert tone="success">
          {subscribed
            ? `Thank you! You are now on the ${current.name} plan.`
            : "Thank you! Your payment is being confirmed. This page updates by itself in a moment."}
        </Alert>
      ) : null}
      {checkout === "cancelled" ? (
        <Alert tone="warning">The checkout was cancelled. Nothing was charged.</Alert>
      ) : null}
      {state.status === "past_due" && subscribed ? (
        <Alert>
          Your last payment did not go through. Please update your payment method under “Manage
          billing” to keep your plan.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={`Your plan: ${current.name}`}
          description={
            subscribed && state.periodEnd ? (
              <>
                {state.cancelAtPeriodEnd ? "Ends on " : "Renews on "}
                <LocalTime timestamp={state.periodEnd} withDate />
                {current.price ? ` · ${current.price} per month` : ""}
              </>
            ) : state.source === "manual" && current.paid ? (
              "This plan was assigned to you by the site team."
            ) : (
              current.description
            )
          }
          action={
            subscribed ? (
              <div className="flex flex-wrap gap-2">
                {state.hasBillingAccount ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busy === "portal"}
                    onClick={() => go("portal", "/api/billing/portal")}
                  >
                    Manage billing
                  </Button>
                ) : null}
                {state.cancelAtPeriodEnd ? (
                  <Button size="sm" loading={busy === "cancel"} onClick={() => setCancel(false)}>
                    Keep my plan
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmCancel(true)}>
                    Cancel plan
                  </Button>
                )}
              </div>
            ) : null
          }
        />
      </Card>

      <div className={cn("grid gap-4", plans.length > 2 ? "lg:grid-cols-3" : "sm:grid-cols-2")}>
        {plans.map((plan) => {
          const isCurrent = plan.id === current.id;
          return (
            <section
              key={plan.id}
              className={cn(
                "flex flex-col rounded-2xl border bg-surface p-5",
                plan.highlighted && !isCurrent ? "border-accent" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{plan.name}</h2>
                {isCurrent ? <Badge tone="accent">Current</Badge> : plan.highlighted ? <Badge>Popular</Badge> : null}
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {plan.price ?? "Free"}
                {plan.price ? <span className="text-sm font-normal text-fg-muted"> / month</span> : null}
              </p>
              <p className="mt-1 min-h-10 text-[0.8125rem] leading-relaxed text-fg-muted">{plan.description}</p>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-[0.8125rem]">
                {[...plan.limits, ...plan.features].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check size={15} className="mt-0.5 shrink-0 text-success" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : !plan.paid ? (
                  subscribed && !state.cancelAtPeriodEnd ? (
                    <Button variant="secondary" className="w-full" onClick={() => setConfirmCancel(true)}>
                      Switch to {plan.name}
                    </Button>
                  ) : (
                    <Button variant="secondary" className="w-full" disabled>
                      {subscribed ? "Starts when your plan ends" : "Included"}
                    </Button>
                  )
                ) : state.source === "manual" && current.paid ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Not available
                  </Button>
                ) : billingAvailable ? (
                  <Button
                    className="w-full"
                    loading={busy === plan.id}
                    onClick={() => go(plan.id, "/api/billing/checkout", { planId: plan.id })}
                  >
                    {subscribed ? `Switch to ${plan.name}` : `Upgrade to ${plan.name}`}
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    Available soon
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-fg-muted">
        Paid plans are billed monthly and renew automatically until you cancel. You can cancel at any
        time; your plan then stays active until the end of the period you have paid for. When you
        switch between paid plans, the new plan starts immediately and unused time of the old one is
        credited. Limits count messages in rolling windows: room frees up continuously as earlier
        messages age out.
      </p>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel your plan?"
        confirmLabel="Cancel plan"
        danger
        loading={busy === "cancel"}
        onConfirm={() => setCancel(true)}
        onClose={() => setConfirmCancel(false)}
      >
        Your {current.name} plan stays active until the end of the period you have paid for
        {state.periodEnd ? (
          <>
            {" "}
            (<LocalTime timestamp={state.periodEnd} withDate />)
          </>
        ) : null}
        . After that you are on the free plan. You will not be charged again.
      </ConfirmDialog>
    </>
  );
}
