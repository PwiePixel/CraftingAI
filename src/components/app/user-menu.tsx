"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  ChevronsUpDown,
  FileText,
  LogOut,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { reloadTo } from "@/lib/client/navigate";
import { useTheme } from "@/lib/client/theme";
import { useDismiss } from "@/lib/client/use-dismiss";
import { cn } from "@/lib/shared/cn";
import type { ThemePreference } from "@/lib/shared/types";
import { useShell } from "./shell";

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({ initial }: { initial: ThemePreference }) {
  const [theme, setTheme] = useTheme(initial);
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
            theme === value ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}

export function UserMenu() {
  const { user, theme, closeMobileSidebar } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  const displayName = user.name || user.email.split("@")[0] || "Account";
  const initial = displayName.charAt(0).toUpperCase();

  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      reloadTo("/login");
    }
  }

  const itemClass =
    "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-fg hover:bg-surface-2";

  return (
    <div ref={ref} className="relative">
      {open ? (
        <div
          role="menu"
          className="animate-pop absolute right-0 bottom-full left-0 z-50 mb-2 rounded-2xl border border-border bg-surface p-1.5 shadow-pop"
        >
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
          </div>
          <div className="px-1 pb-1.5">
            <ThemeToggle initial={theme} />
          </div>
          <div className="my-1 border-t border-border" />
          <Link
            href="/settings"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              close();
              closeMobileSidebar();
            }}
          >
            <Settings size={16} className="text-fg-muted" />
            Settings
          </Link>
          {user.role === "admin" ? (
            <Link href="/admin" role="menuitem" className={itemClass} onClick={close}>
              <ShieldCheck size={16} className="text-fg-muted" />
              Admin dashboard
            </Link>
          ) : null}
          <Link href="/terms" target="_blank" role="menuitem" className={itemClass} onClick={close}>
            <FileText size={16} className="text-fg-muted" />
            Terms &amp; policies
          </Link>
          <div className="my-1 border-t border-border" />
          <button type="button" role="menuitem" className={itemClass} onClick={signOut}>
            <LogOut size={16} className="text-fg-muted" />
            Sign out
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-surface-2"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{displayName}</span>
          <span className="block truncate text-xs text-fg-muted">
            {user.role === "admin" ? "Administrator" : "Free plan"}
          </span>
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-fg-subtle" />
      </button>
    </div>
  );
}
