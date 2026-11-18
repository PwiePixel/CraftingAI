"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, Pencil, Search, SquarePen, Trash2 } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/shared/cn";
import type { ConversationSummary } from "@/lib/shared/types";
import { useShell } from "./shell";
import { UserMenu } from "./user-menu";

const DAY_MS = 24 * 60 * 60 * 1000;

interface Group {
  label: string;
  items: ConversationSummary[];
}

/** Buckets conversations by age. `offsetMs` shifts UTC to the viewer's time zone. */
function groupConversations(items: ConversationSummary[], now: number, offsetMs: number): Group[] {
  const dayIndex = (timestamp: number) => Math.floor((timestamp + offsetMs) / DAY_MS);
  const today = dayIndex(now);
  const groups: Group[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Previous 30 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const item of items) {
    const age = today - dayIndex(item.updatedAt);
    const index = age <= 0 ? 0 : age === 1 ? 1 : age <= 7 ? 2 : age <= 30 ? 3 : 4;
    groups[index]!.items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

export function Sidebar() {
  const shell = useShell();
  const pathname = usePathname();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Rendered in UTC on the server; switched to local time after hydration.
  const [clock, setClock] = useState<{ now: number; offsetMs: number } | null>(null);

  useEffect(() => {
    const update = () =>
      setClock({ now: Date.now(), offsetMs: -new Date().getTimezoneOffset() * 60_000 });
    update();
    const timer = window.setInterval(update, 10 * 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeId = pathname.startsWith("/chat/") ? pathname.slice("/chat/".length) : null;

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? shell.conversations.filter((item) => item.title.toLowerCase().includes(needle))
      : shell.conversations;
    const newest = filtered[0]?.updatedAt ?? 0;
    return groupConversations(filtered, clock?.now ?? newest, clock?.offsetMs ?? 0);
  }, [shell.conversations, query, clock]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/conversations/${pendingDelete.id}`, { method: "DELETE" });
      shell.removeConversation(pendingDelete.id);
      if (activeId === pendingDelete.id) shell.startNewChat();
      setPendingDelete(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between pr-2.5 pl-3.5">
        <Link
          href="/chat"
          onClick={(event) => {
            event.preventDefault();
            shell.startNewChat();
          }}
          className="flex items-center gap-2.5 rounded-lg py-1 pr-2"
        >
          <LogoMark size={26} />
          <span className="text-[1.02rem] font-semibold tracking-tight">{shell.site.siteName}</span>
        </Link>
        <button
          type="button"
          onClick={shell.toggleSidebar}
          aria-label="Close sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <PanelLeftClose size={19} />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-2.5 pb-2">
        <button
          type="button"
          onClick={shell.startNewChat}
          className="flex h-10 items-center gap-2.5 rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium transition-colors hover:bg-surface-2"
        >
          <SquarePen size={17} />
          New chat
        </button>
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            className="h-9 w-full rounded-xl bg-transparent pr-3 pl-9 text-sm placeholder:text-fg-subtle hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
          />
        </label>
      </div>

      <nav aria-label="Chat history" className="scroll-area min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-[0.8125rem] leading-relaxed text-fg-subtle">
            {query ? "No chats match your search." : "Your conversations will appear here."}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mt-3 first:mt-1">
              <h3 className="px-3 pb-1 text-[0.6875rem] font-medium tracking-wide text-fg-subtle uppercase">
                {group.label}
              </h3>
              <ul className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <ConversationItem
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    onDelete={() => setPendingDelete(item)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <UserMenu />
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete chat?"
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      >
        This permanently deletes <strong className="text-fg">{pendingDelete?.title}</strong>. This
        cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

function ConversationItem({
  item,
  active,
  onDelete,
}: {
  item: ConversationSummary;
  active: boolean;
  onDelete: () => void;
}) {
  const shell = useShell();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    const next = title.trim();
    setEditing(false);
    if (!next || next === item.title) {
      setTitle(item.title);
      return;
    }
    shell.upsertConversation({ id: item.id, title: next });
    try {
      await api(`/api/conversations/${item.id}`, { method: "PATCH", body: { title: next } });
    } catch (error) {
      shell.upsertConversation({ id: item.id, title: item.title });
      toast.error(errorMessage(error));
    }
  }

  if (editing) {
    return (
      <li>
        <input
          ref={inputRef}
          value={title}
          maxLength={80}
          aria-label="Chat title"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setTitle(item.title);
              setEditing(false);
            }
          }}
          className="h-9 w-full rounded-lg border border-accent bg-surface px-2.5 text-sm focus:outline-none"
        />
      </li>
    );
  }

  return (
    <li className="group relative">
      <Link
        href={`/chat/${item.id}`}
        prefetch={false}
        aria-current={active ? "page" : undefined}
        onClick={(event) => {
          // The open conversation may still be streaming: do not reload it.
          if (active) event.preventDefault();
          shell.closeMobileSidebar();
        }}
        className={cn(
          "flex h-9 items-center rounded-lg pr-2 pl-3 text-sm transition-colors",
          "group-focus-within:pr-16 group-hover:pr-16",
          active ? "bg-surface-3 font-medium text-fg" : "text-fg hover:bg-surface-2",
        )}
      >
        <span className="truncate">{item.title}</span>
      </Link>
      <div className="absolute top-1/2 right-1 hidden -translate-y-1/2 items-center group-focus-within:flex group-hover:flex">
        <button
          type="button"
          aria-label={`Rename ${item.title}`}
          onClick={() => {
            setTitle(item.title);
            setEditing(true);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          aria-label={`Delete ${item.title}`}
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
