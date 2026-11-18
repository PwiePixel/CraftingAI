import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogoMark } from "@/components/logo";
import { Badge, buttonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  const { siteName } = getSettings();
  return (
    <div className="min-h-dvh bg-bg-subtle">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <LogoMark size={26} />
              <span className="truncate font-semibold tracking-tight">{siteName}</span>
              <Badge tone="accent">Admin</Badge>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden truncate text-[0.8125rem] text-fg-muted sm:block">{user.email}</span>
              <Link href="/chat" className={buttonClass("secondary", "sm")}>
                <ArrowLeft size={15} />
                Back to chat
              </Link>
            </div>
          </div>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
