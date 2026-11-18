"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Database, Gauge, Gem, Lock, Palette, UserRound } from "lucide-react";
import { TopBar } from "@/components/app/shell";
import { cn } from "@/lib/shared/cn";

const sections = [
  { href: "/settings/profile", label: "Profile", icon: UserRound },
  { href: "/settings/plan", label: "Plan", icon: Gem },
  { href: "/settings/usage", label: "Usage", icon: Gauge },
  { href: "/settings/appearance", label: "Appearance", icon: Palette },
  { href: "/settings/security", label: "Security", icon: Lock },
  { href: "/settings/data", label: "Your data", icon: Database },
];

/** Settings area: a section list at the side (a scrolling row on phones) and the section itself. */
export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar>
        <h1 className="px-2 text-[0.95rem] font-semibold">Settings</h1>
      </TopBar>
      <div className="scroll-area flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-2 pb-12 md:flex-row md:gap-8">
          <nav aria-label="Settings sections" className="md:w-48 md:shrink-0">
            <ul className="scroll-area flex gap-1 overflow-x-auto pb-1 md:sticky md:top-2 md:flex-col md:overflow-visible md:pb-0">
              {sections.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={href} className="shrink-0">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm whitespace-nowrap transition-colors",
                        active ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <Icon size={16} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
