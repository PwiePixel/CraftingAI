"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PanelLeft, SquarePen } from "lucide-react";
import { api } from "@/lib/client/api";
import { setPreferenceCookie } from "@/lib/client/cookies";
import { cn } from "@/lib/shared/cn";
import type {
  ConversationSummary,
  PublicPlan,
  PublicSite,
  PublicTier,
  SessionUser,
  ThemePreference,
  TierId,
} from "@/lib/shared/types";
import { Sidebar } from "./sidebar";

export interface ShellData {
  user: SessionUser;
  plan: PublicPlan;
  site: PublicSite;
  tiers: PublicTier[];
  conversations: ConversationSummary[];
  preferredTier: TierId | null;
  sidebarCollapsed: boolean;
  theme: ThemePreference;
}

interface ShellValue {
  user: SessionUser;
  plan: PublicPlan;
  site: PublicSite;
  theme: ThemePreference;
  tiers: PublicTier[];
  updateTier: (tier: PublicTier) => void;
  /** Reloads the daily allowances from the server. */
  refreshTiers: () => void;
  preferredTier: TierId | null;
  setPreferredTier: (tier: TierId) => void;
  conversations: ConversationSummary[];
  upsertConversation: (patch: Partial<ConversationSummary> & { id: string }) => void;
  removeConversation: (id: string) => void;
  clearConversations: () => void;
  /** Changes whenever the user asks for a fresh chat; used to reset the chat view. */
  chatSession: number;
  startNewChat: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  closeMobileSidebar: () => void;
}

const ShellContext = createContext<ShellValue | null>(null);

export function useShell(): ShellValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside <AppShell>");
  return value;
}

export function AppShell({ data, children }: { data: ShellData; children: ReactNode }) {
  const router = useRouter();
  const [conversations, setConversations] = useState(data.conversations);
  const [tiers, setTiers] = useState(data.tiers);
  const [preferredTier, setPreferredTierState] = useState(data.preferredTier);
  const [chatSession, setChatSession] = useState(0);
  const [collapsed, setCollapsed] = useState(data.sidebarCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const updateTier = useCallback((tier: PublicTier) => {
    setTiers((current) => current.map((item) => (item.id === tier.id ? tier : item)));
  }, []);

  const refreshTiers = useCallback(() => {
    api<{ tiers: PublicTier[] }>("/api/me")
      .then((response) => setTiers(response.tiers))
      .catch(() => undefined);
  }, []);

  const setPreferredTier = useCallback((tier: TierId) => {
    setPreferredTierState(tier);
    setPreferenceCookie("lishia_tier", tier);
  }, []);

  const upsertConversation = useCallback(
    (patch: Partial<ConversationSummary> & { id: string }) => {
      setConversations((current) => {
        const existing = current.find((item) => item.id === patch.id);
        const now = Date.now();
        const merged: ConversationSummary = {
          title: "New chat",
          tier: "lite",
          createdAt: now,
          updatedAt: now,
          ...existing,
          ...patch,
        };
        return [merged, ...current.filter((item) => item.id !== patch.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
      });
    },
    [],
  );

  const removeConversation = useCallback((id: string) => {
    setConversations((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearConversations = useCallback(() => setConversations([]), []);

  const closeMobileSidebar = useCallback(() => setMobileOpen(false), []);

  const startNewChat = useCallback(() => {
    setChatSession((value) => value + 1);
    setMobileOpen(false);
    router.push("/chat");
  }, [router]);

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setCollapsed((value) => {
        setPreferenceCookie("lishia_sidebar", value ? "open" : "collapsed");
        return !value;
      });
    } else {
      setMobileOpen((value) => !value);
    }
  }, []);

  const value = useMemo<ShellValue>(
    () => ({
      user: data.user,
      plan: data.plan,
      site: data.site,
      theme: data.theme,
      tiers,
      updateTier,
      refreshTiers,
      preferredTier,
      setPreferredTier,
      conversations,
      upsertConversation,
      removeConversation,
      clearConversations,
      chatSession,
      startNewChat,
      sidebarCollapsed: collapsed,
      toggleSidebar,
      closeMobileSidebar,
    }),
    [
      data.user,
      data.plan,
      data.site,
      data.theme,
      tiers,
      updateTier,
      refreshTiers,
      preferredTier,
      setPreferredTier,
      conversations,
      upsertConversation,
      removeConversation,
      clearConversations,
      chatSession,
      startNewChat,
      collapsed,
      toggleSidebar,
      closeMobileSidebar,
    ],
  );

  return (
    <ShellContext.Provider value={value}>
      <div className="flex h-dvh overflow-hidden bg-bg">
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-30 bg-overlay md:hidden"
            onClick={closeMobileSidebar}
          />
        ) : null}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[17.5rem] max-w-[85vw] border-r border-border bg-bg-subtle transition-transform duration-200",
            "md:static md:z-auto md:w-[17rem] md:shrink-0 md:translate-x-0 md:transition-none",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
            collapsed && "md:hidden",
          )}
        >
          <Sidebar />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ShellContext.Provider>
  );
}

/** Header row of the main column, with the sidebar toggle when it is needed. */
export function TopBar({ children }: { children?: ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, startNewChat } = useShell();
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2.5 sm:px-3">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg",
          !sidebarCollapsed && "md:hidden",
        )}
      >
        <PanelLeft size={19} />
      </button>
      <button
        type="button"
        onClick={startNewChat}
        aria-label="New chat"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg",
          !sidebarCollapsed && "md:hidden",
        )}
      >
        <SquarePen size={18} />
      </button>
      {children}
    </header>
  );
}
