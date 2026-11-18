import type { Metadata } from "next";
import { CircleAlert, CircleCheck } from "lucide-react";
import { ColumnChart, type ChartSeries } from "@/components/admin/column-chart";
import { PageHeader, Td, Th } from "@/components/admin/page-header";
import { Meter, StatTile } from "@/components/admin/stat";
import { Card, CardHeader } from "@/components/ui";
import { upstreamStatus } from "@/lib/server/ai";
import { requireAdmin } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { getSettings } from "@/lib/server/settings";
import { getAdminStats } from "@/lib/server/stats";
import { formatCompact, formatDateTime, formatInt, formatUsd } from "@/lib/shared/format";
import { TIER_IDS, type TierId } from "@/lib/shared/types";

export const metadata: Metadata = { title: "Overview" };

// Each model tier keeps its colour everywhere, whatever is currently enabled.
const tierColor: Record<TierId, string> = {
  lite: "var(--series-1)",
  pro: "var(--series-2)",
  ultra: "var(--series-3)",
};

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      {ok ? (
        <CircleCheck size={18} className="mt-0.5 shrink-0 text-success" />
      ) : (
        <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[0.8125rem] break-words text-fg-muted">{detail}</p>
      </div>
    </li>
  );
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const settings = getSettings();
  const stats = getAdminStats(30);
  const status = upstreamStatus();

  const days = stats.daily.map((point) => point.day);
  const messageSeries: ChartSeries[] = TIER_IDS.map((id) => ({
    id,
    label: settings.tiers[id].label,
    color: tierColor[id],
  }));
  const messageValues = Object.fromEntries(
    TIER_IDS.map((id) => [id, stats.daily.map((point) => point.messages[id])]),
  );
  const costSeries: ChartSeries[] = [{ id: "cost", label: "Estimated spend", color: "var(--series-1)" }];
  const costValues = { cost: stats.daily.map((point) => point.costUsd) };

  const budget = settings.dailyBudgetUsd;
  const upstreamHealthy =
    status.lastErrorAt === null ||
    (status.lastSuccessAt !== null && status.lastSuccessAt > status.lastErrorAt);

  return (
    <>
      <PageHeader title="Overview" description="Usage and spend for the last 30 days. All days are in UTC." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Registered users"
          value={formatInt(stats.users.total)}
          detail={`${formatInt(stats.users.newLast7Days)} new in the last 7 days · ${formatInt(stats.users.onPaidPlans)} on paid plans`}
        />
        <StatTile
          label="Active users today"
          value={formatInt(stats.users.activeToday)}
          detail={`${formatInt(stats.conversations)} conversations in total`}
        />
        <StatTile
          label="Messages today"
          value={formatInt(stats.today.messages)}
          detail={`${formatCompact(stats.today.inputTokens)} tokens in · ${formatCompact(stats.today.outputTokens)} out`}
        />
        <StatTile label="Estimated spend today" value={formatUsd(stats.today.costUsd)}>
          {budget > 0 ? (
            <Meter
              value={stats.today.costUsd}
              max={budget}
              label={`${Math.min(999, Math.round((stats.today.costUsd / budget) * 100))}% of the ${formatUsd(budget)} daily budget`}
            />
          ) : (
            <p className="mt-2 text-xs text-fg-muted">No daily budget set</p>
          )}
        </StatTile>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Messages per day"
            description={`${formatInt(stats.last30Days.messages)} messages in 30 days, by model`}
          />
          <div className="p-5">
            <ColumnChart
              days={days}
              series={messageSeries}
              values={messageValues}
              unit="count"
              label="Stacked column chart of messages per day by model for the last 30 days"
            />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Estimated spend per day"
            description={`${formatUsd(stats.last30Days.costUsd)} in 30 days, based on the configured token prices`}
          />
          <div className="p-5">
            <ColumnChart
              days={days}
              series={costSeries}
              values={costValues}
              unit="usd"
              label="Column chart of estimated spend per day for the last 30 days"
            />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Models" description="Last 30 days" />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <Th>Model</Th>
                  <Th align="right">Messages</Th>
                  <Th align="right">Tokens in</Th>
                  <Th align="right">Tokens out</Th>
                  <Th align="right">Est. spend</Th>
                </tr>
              </thead>
              <tbody>
                {stats.tiers.map((row) => (
                  <tr key={row.tier} className="border-b border-border last:border-0">
                    <Td>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ background: tierColor[row.tier] }}
                        />
                        <span className="font-medium">{settings.tiers[row.tier].label}</span>
                      </span>
                      <span className="mt-0.5 block pl-[1.125rem] font-mono text-xs text-fg-subtle">
                        {settings.tiers[row.tier].model}
                      </span>
                    </Td>
                    <Td align="right">{formatInt(row.messages)}</Td>
                    <Td align="right">{formatCompact(row.inputTokens)}</Td>
                    <Td align="right">{formatCompact(row.outputTokens)}</Td>
                    <Td align="right">{formatUsd(row.costUsd)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Most active users" description="By estimated spend, last 30 days" />
          {stats.topUsers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-muted">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <Th>User</Th>
                    <Th align="right">Messages</Th>
                    <Th align="right">Est. spend</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topUsers.map((row) => (
                    <tr key={row.userId ?? "deleted"} className="border-b border-border last:border-0">
                      <Td className="max-w-[16rem] truncate">{row.email}</Td>
                      <Td align="right">{formatInt(row.messages)}</Td>
                      <Td align="right">{formatUsd(row.costUsd)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="System status" />
        <ul className="divide-y divide-border">
          <StatusRow
            ok={env.aiKeyConfigured}
            label="AI provider key"
            detail={
              env.aiKeyConfigured
                ? "An API key is configured on the server."
                : "No API key is configured. Set ANTHROPIC_API_KEY in the environment file and restart the service."
            }
          />
          <StatusRow
            ok={upstreamHealthy}
            label="AI provider connection"
            detail={
              status.lastErrorAt && !upstreamHealthy
                ? `Last error ${formatDateTime(status.lastErrorAt)}: ${status.lastError}`
                : status.lastSuccessAt
                  ? `Last successful response ${formatDateTime(status.lastSuccessAt)}.`
                  : "No requests since the service was last started."
            }
          />
          <StatusRow
            ok
            label="Registration"
            detail={
              settings.registrationOpen
                ? "Open: anyone can create an account."
                : "Closed: only administrators can create accounts."
            }
          />
        </ul>
      </Card>
    </>
  );
}
