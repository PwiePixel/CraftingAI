import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Td, Th } from "@/components/admin/page-header";
import { buttonClass } from "@/components/ui";
import { listAudit } from "@/lib/server/audit";
import { requireAdmin } from "@/lib/server/auth";
import { formatDateTime, formatInt } from "@/lib/shared/format";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

const actionLabels: Record<string, string> = {
  "user.register": "Account created",
  "user.login": "Signed in",
  "user.login_failed": "Failed sign-in",
  "user.password_change": "Password changed",
  "user.delete_self": "Account deleted by user",
  "settings.update": "Settings changed",
  "admin.user_create": "User created by admin",
  "admin.user_update": "User changed by admin",
  "admin.user_delete": "User deleted by admin",
  "admin.user_password_reset": "Password reset by admin",
  "billing.subscribed": "Plan bought",
  "billing.cancel_scheduled": "Plan cancellation scheduled",
  "billing.cancel_withdrawn": "Plan cancellation withdrawn",
  "billing.subscription_ended": "Subscription ended",
  "cli.admin_create": "Administrator created (command line)",
  "cli.password_reset": "Password reset (command line)",
};

function describe(detail: string | null): string {
  if (!detail) return "";
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;
    return Object.entries(parsed)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join(" · ");
  } catch {
    return "";
  }
}

type Props = { searchParams: Promise<{ page?: string | string[] }> };

export default async function AdminAuditPage({ searchParams }: Props) {
  await requireAdmin();
  const raw = (await searchParams).page;
  const page = Math.max(1, Math.floor(Number(Array.isArray(raw) ? raw[0] : raw) || 1));
  const { rows, total } = listAudit(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`${formatInt(total)} security-relevant events. Entries are kept for 6 months; IP addresses are stored only as keyed hashes.`}
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <Th>Time</Th>
                <Th>Event</Th>
                <Th>Actor</Th>
                <Th>Details</Th>
                <Th>Address hash</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-fg-muted">
                    Nothing has been recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <Td className="whitespace-nowrap text-fg-muted">{formatDateTime(row.created_at)}</Td>
                    <Td className="whitespace-nowrap font-medium">{actionLabels[row.action] ?? row.action}</Td>
                    <Td className="max-w-[14rem] truncate">{row.actor_email ?? "—"}</Td>
                    <Td className="max-w-[22rem] text-fg-muted">
                      <span className="line-clamp-2 break-words">{describe(row.detail)}</span>
                    </Td>
                    <Td className="font-mono text-xs text-fg-subtle">{row.ip_hash?.slice(0, 12) ?? "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-fg-muted">
          <span>
            Page {page} of {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link href={`/admin/audit?page=${page - 1}`} className={buttonClass("secondary", "sm")}>
                Newer
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={`/admin/audit?page=${page + 1}`} className={buttonClass("secondary", "sm")}>
                Older
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}
