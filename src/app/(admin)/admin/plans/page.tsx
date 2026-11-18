import type { Metadata } from "next";
import { CircleAlert, CircleCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PlansForm } from "@/components/admin/plans-form";
import { Card, CardHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { billingConfigured, webhookConfigured } from "@/lib/server/billing";
import { env } from "@/lib/server/env";
import { getSettings } from "@/lib/server/settings";
import { countUsersOnPlan } from "@/lib/server/users";

export const metadata: Metadata = { title: "Plans" };

function Step({ done, title, children }: { done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      {done ? (
        <CircleCheck size={18} className="mt-0.5 shrink-0 text-success" />
      ) : (
        <CircleAlert size={18} className="mt-0.5 shrink-0 text-warning" />
      )}
      <div className="min-w-0 text-[0.8125rem] leading-relaxed text-fg-muted">
        <p className="text-sm font-medium text-fg">{title}</p>
        {children}
      </div>
    </li>
  );
}

export default async function AdminPlansPage() {
  await requireAdmin();
  const settings = getSettings();
  const keyReady = billingConfigured();
  const webhookReady = webhookConfigured();
  const subscribers = Object.fromEntries(
    settings.billing.plans.map((plan) => [plan.id, countUsersOnPlan(plan.id)]),
  );

  return (
    <>
      <PageHeader
        title="Plans"
        description="Define the plans people can buy. Prices are stored here and handed to the payment provider at checkout."
      />

      <Card className="mb-4">
        <CardHeader
          title="Payments with Stripe"
          description={
            keyReady && webhookReady
              ? "Payments are set up. Paid plans can be bought."
              : "Until payments are set up, paid plans are shown as “Available soon”. You can still assign plans by hand under Users."
          }
        />
        <ul className="divide-y divide-border">
          <Step done={keyReady} title="1. Secret key">
            Run <code className="font-mono text-fg">sudo bash install.sh --stripe</code> on the server
            and enter your Stripe secret key (from the Stripe dashboard under Developers → API keys).
          </Step>
          <Step done={webhookReady} title="2. Webhook">
            In the Stripe dashboard, add a webhook endpoint with the address{" "}
            <code className="font-mono break-all text-fg">{env.appUrl}/api/stripe/webhook</code> and
            the events <code className="font-mono text-fg">checkout.session.completed</code>,{" "}
            <code className="font-mono text-fg">customer.subscription.created</code>,{" "}
            <code className="font-mono text-fg">customer.subscription.updated</code> and{" "}
            <code className="font-mono text-fg">customer.subscription.deleted</code>. Enter its signing
            secret in the same command.
          </Step>
          <Step done title="3. Customer portal">
            To let customers change their payment method and see invoices, switch on the customer
            portal once in the Stripe dashboard (Settings → Billing → Customer portal).
          </Step>
        </ul>
      </Card>

      <PlansForm
        billing={settings.billing}
        subscribers={subscribers}
        tierLabels={{
          lite: settings.tiers.lite.label,
          pro: settings.tiers.pro.label,
          ultra: settings.tiers.ultra.label,
        }}
      />
    </>
  );
}
