import type { Metadata } from "next";
import Link from "next/link";
import { Meter } from "@/components/admin/stat";
import { LocalTime } from "@/components/local-time";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { publicPlan } from "@/lib/server/plans";
import { getSettings } from "@/lib/server/settings";
import { userMessageCounts } from "@/lib/server/stats";
import { publicTiers } from "@/lib/server/usage";
import { formatInt } from "@/lib/shared/format";
import type { UsageWindow } from "@/lib/shared/types";

export const metadata: Metadata = { title: "Usage" };

const windowTitles: Record<UsageWindow["kind"], string> = {
  day: "Today",
  fiveHour: "Last 5 hours",
  week: "Last 7 days",
};

function WindowMeter({ window }: { window: UsageWindow }) {
  const reached = window.used >= window.limit;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{windowTitles[window.kind]}</span>
        <span className="text-fg-muted tabular-nums">
          {formatInt(Math.min(window.used, window.limit))} of {formatInt(window.limit)} messages
        </span>
      </div>
      <Meter
        value={window.used}
        max={Math.max(1, window.limit)}
        label={
          reached
            ? "Limit reached"
            : `${formatInt(window.limit - window.used)} ${window.limit - window.used === 1 ? "message" : "messages"} left`
        }
      />
      {window.resetsAt && window.used > 0 ? (
        <p className="mt-1 text-xs text-fg-muted">
          {window.kind === "day" ? "Resets at " : reached ? "Next message available at " : "Starts to free up at "}
          <LocalTime timestamp={window.resetsAt} />
        </p>
      ) : null}
    </div>
  );
}

export default async function UsagePage() {
  const { user } = await requireUser();
  const settings = getSettings();
  const plan = publicPlan(user, settings);
  const tiers = publicTiers(user, settings);
  const last30 = userMessageCounts(user.id, 30);
  const total = tiers.reduce((sum, tier) => sum + last30[tier.id], 0);

  return (
    <>
      <Card>
        <CardHeader
          title="Usage"
          description={
            user.role === "admin"
              ? "Administrators are not limited."
              : plan.paid
                ? `You are on the ${plan.name} plan. Limits count messages in rolling windows, so room frees up continuously.`
                : `You are on the ${plan.name} plan. Limits reset every day at midnight UTC.`
          }
          action={
            user.role === "admin" ? null : (
              <Link href="/settings/plan" className={buttonClass(plan.paid ? "secondary" : "primary", "sm")}>
                {plan.paid ? "View plans" : "Get higher limits"}
              </Link>
            )
          }
        />
        <div className="flex flex-col divide-y divide-border">
          {tiers.map((tier) => (
            <section key={tier.id} className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{tier.label}</h2>
                {!tier.included ? <Badge>Not in your plan</Badge> : null}
                {tier.blockedBy ? <Badge tone="warning">Limit reached</Badge> : null}
              </div>
              {!tier.included ? (
                <p className="text-[0.8125rem] text-fg-muted">This model is not part of your plan.</p>
              ) : tier.windows.length === 0 ? (
                <p className="text-[0.8125rem] text-fg-muted">Unlimited.</p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  {tier.windows.map((window) => (
                    <WindowMeter key={window.kind} window={window} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Last 30 days" description={`${formatInt(total)} ${total === 1 ? "message" : "messages"} in total.`} />
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-muted">
              <th className="px-5 py-2.5 font-medium">Model</th>
              <th className="px-5 py-2.5 text-right font-medium">Messages</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3">{tier.label}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatInt(last30[tier.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
