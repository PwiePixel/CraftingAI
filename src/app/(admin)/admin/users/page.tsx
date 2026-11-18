import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { UsersManager } from "@/components/admin/users-manager";
import { Button, Input, buttonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { listAdminUsers } from "@/lib/server/stats";
import { formatInt } from "@/lib/shared/format";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 25;

type Props = { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AdminUsersPage({ searchParams }: Props) {
  const { user } = await requireAdmin();
  const params = await searchParams;
  const query = (first(params.q) ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(first(params.page)) || 1));
  const { rows, total } = listAdminUsers({ query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (target: number) =>
    `/admin/users?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(target) })}`;

  return (
    <>
      <PageHeader
        title="Users"
        description={`${formatInt(total)} ${total === 1 ? "account" : "accounts"}${query ? ` matching “${query}”` : ""}`}
        action={
          <form action="/admin/users" className="flex items-center gap-2">
            <label className="relative block">
              <span className="sr-only">Search users</span>
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
              <Input name="q" type="search" defaultValue={query} placeholder="Search email or name" className="w-64 pl-9" />
            </label>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        }
      />

      <UsersManager rows={rows} currentUserId={user.id} />

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-fg-muted">
          <span>
            Page {page} of {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link href={link(page - 1)} className={buttonClass("secondary", "sm")}>
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={link(page + 1)} className={buttonClass("secondary", "sm")}>
                Next
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}
