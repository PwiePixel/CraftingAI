"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Code, Lightbulb, Map as MapIcon, PenLine, RefreshCw } from "lucide-react";
import { TopBar, useShell } from "@/components/app/shell";
import { LocalTime } from "@/components/local-time";
import { LogoMark } from "@/components/logo";
import { Alert } from "@/components/ui";
import { api, ApiClientError, errorMessage, toApiError } from "@/lib/client/api";
import { readChatStream } from "@/lib/client/chat-stream";
import { reloadTo } from "@/lib/client/navigate";
import type {
  ChatMessage,
  ConversationSummary,
  PublicTier,
  TierId,
} from "@/lib/shared/types";
import { Composer } from "./composer";
import { MessageItem, type UiMessage } from "./message-item";
import { allowanceText, ModelPicker, remainingMessages } from "./model-picker";

export interface InitialConversation {
  conversation: ConversationSummary;
  /** The most recent messages. */
  messages: ChatMessage[];
  /** True when older messages exist that have not been loaded. */
  hasEarlier: boolean;
}

const SUGGESTIONS = [
  {
    icon: Lightbulb,
    title: "Explain a concept",
    prompt: "Explain how neural networks learn, in simple terms and with an everyday analogy.",
  },
  {
    icon: PenLine,
    title: "Draft a message",
    prompt: "Write a friendly email asking to move tomorrow's meeting to next week.",
  },
  {
    icon: Code,
    title: "Help with code",
    prompt:
      "Write a Python function that removes duplicates from a list while keeping the original order, and explain how it works.",
  },
  {
    icon: MapIcon,
    title: "Plan something",
    prompt: "Plan a relaxed three-day itinerary for a first visit to Lisbon.",
  },
];

function chooseTier(tiers: PublicTier[], candidates: Array<TierId | null | undefined>): TierId {
  for (const candidate of candidates) {
    if (candidate && tiers.some((tier) => tier.id === candidate)) return candidate;
  }
  return tiers[0]?.id ?? "lite";
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function ChatView({
  initial,
  onCreated,
}: {
  initial: InitialConversation | null;
  onCreated?: (conversationId: string) => void;
}) {
  const shell = useShell();
  const { tiers, site, user, plan, upsertConversation, updateTier, refreshTiers, setPreferredTier } = shell;

  const [conversationId, setConversationId] = useState<string | null>(
    initial?.conversation.id ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>(initial?.messages ?? []);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(initial?.hasEarlier ?? false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [tierId, setTierId] = useState<TierId>(() =>
    chooseTier(tiers, [initial?.conversation.tier, shell.preferredTier, site.defaultTier]),
  );

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  /** Scroll height before older messages were inserted above the viewport. */
  const heightBeforePrepend = useRef<number | null>(null);
  const conversationIdRef = useRef(conversationId);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Leaving the view cancels a reply that is still streaming.
  useEffect(() => () => abortRef.current?.abort(), []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (heightBeforePrepend.current !== null) {
      // Keep the message the reader was looking at in place.
      element.scrollTop += element.scrollHeight - heightBeforePrepend.current;
      heightBeforePrepend.current = null;
    } else if (stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  // Content can change height without a new message (formatting applied after
  // loading, fonts arriving, the window resizing): stay pinned to the bottom.
  useEffect(() => {
    const element = scrollRef.current;
    const content = contentRef.current;
    if (!element || !content) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  async function loadEarlier() {
    const first = messages[0];
    if (!first || !conversationId || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await api<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/api/conversations/${conversationId}?before=${encodeURIComponent(first.id)}`,
      );
      heightBeforePrepend.current = scrollRef.current?.scrollHeight ?? null;
      stickToBottom.current = false;
      setMessages((current) => [...page.messages, ...current]);
      setHasEarlier(page.hasMore);
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setLoadingEarlier(false);
    }
  }

  const tier = tiers.find((item) => item.id === tierId) ?? tiers[0];
  const remaining = tier ? remainingMessages(tier) : 0;
  const exhausted = remaining === 0;

  const send = useCallback(
    async (text: string, regenerate = false) => {
      if (abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setRequestError(null);
      setStreaming(true);
      stickToBottom.current = true;

      const stamp = Date.now();
      const localUserId = `local-user-${stamp}`;
      const localReplyId = `local-reply-${stamp}`;
      const before = messagesRef.current;
      const sendTier = tierId;

      setMessages((current) => {
        let base = current;
        if (regenerate) {
          let end = base.length;
          while (end > 0 && base[end - 1]!.role === "assistant") end -= 1;
          base = base.slice(0, end);
        } else {
          base = [
            ...base,
            {
              id: localUserId,
              role: "user",
              content: text,
              tier: sendTier,
              status: "complete",
              createdAt: stamp,
            },
          ];
        }
        return [
          ...base,
          {
            id: localReplyId,
            role: "assistant",
            content: "",
            tier: sendTier,
            status: "complete",
            createdAt: stamp,
            pending: true,
          },
        ];
      });

      let received = "";
      let frame = 0;
      let started = false;
      let finished = false;
      let notice: string | undefined;
      let activeId = conversationIdRef.current;

      const patchReply = (patch: Partial<UiMessage> | null) =>
        setMessages((current) =>
          patch === null
            ? current.filter((message) => message.id !== localReplyId)
            : current.map((message) =>
                message.id === localReplyId ? { ...message, ...patch } : message,
              ),
        );
      // Repaint at most once per animation frame, however fast text arrives.
      const paint = () => {
        frame = 0;
        patchReply({ content: received });
      };

      try {
        let response: Response;
        for (let attempt = 0; ; attempt += 1) {
          response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            signal: controller.signal,
            body: JSON.stringify({
              conversationId: activeId ?? undefined,
              message: regenerate ? undefined : text,
              tier: sendTier,
              regenerate: regenerate || undefined,
            }),
          });
          // The previous reply may still be winding down on the server.
          if (response.status === 409 && attempt < 4) {
            await delay(500);
            continue;
          }
          break;
        }
        if (!response.ok) throw await toApiError(response);

        for await (const event of readChatStream(response)) {
          switch (event.type) {
            case "meta": {
              started = true;
              const userMessageId = event.userMessageId;
              if (userMessageId) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === localUserId ? { ...message, id: userMessageId } : message,
                  ),
                );
              }
              if (!activeId) {
                activeId = event.conversationId;
                conversationIdRef.current = activeId;
                setConversationId(activeId);
                upsertConversation({
                  id: activeId,
                  title: event.title,
                  tier: sendTier,
                  createdAt: stamp,
                  updatedAt: stamp,
                });
                onCreated?.(activeId);
              } else {
                upsertConversation({ id: activeId, tier: sendTier, updatedAt: stamp });
              }
              break;
            }
            case "delta":
              received += event.text;
              if (!frame) frame = requestAnimationFrame(paint);
              break;
            case "error":
              notice = event.message;
              break;
            case "done": {
              finished = true;
              if (frame) cancelAnimationFrame(frame);
              frame = 0;
              const final = event.message;
              if (final) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === localReplyId ? { ...final, notice } : message,
                  ),
                );
              } else {
                patchReply(null);
              }
              updateTier(event.tier);
              // The reply is complete; a title for the chat may still follow.
              if (abortRef.current === controller) abortRef.current = null;
              setStreaming(false);
              break;
            }
            case "title":
              if (activeId) upsertConversation({ id: activeId, title: event.title });
              break;
          }
        }
        if (!finished) throw new Error("The connection was interrupted.");
      } catch (error) {
        if (frame) cancelAnimationFrame(frame);
        if (finished) {
          // Only the optional title was lost.
        } else if (controller.signal.aborted) {
          if (received.trim()) patchReply({ content: received, status: "stopped", pending: false });
          else patchReply(null);
        } else if (!started) {
          // Nothing was saved: undo the optimistic update and keep the text.
          setMessages(before);
          if (!regenerate) setDraft((current) => current || text);
          setRequestError(errorMessage(error));
          if (error instanceof ApiClientError) {
            if (error.status === 401) reloadTo("/login");
            if (error.code === "quota_exceeded") refreshTiers();
          }
        } else {
          patchReply({
            content: received,
            status: "error",
            pending: false,
            notice: "The connection was interrupted. Please try again.",
          });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStreaming(false);
        }
      }
    },
    [tierId, upsertConversation, updateTier, refreshTiers, onCreated],
  );

  const regenerate = useCallback(() => void send("", true), [send]);

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send(text);
  }

  function onScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottom.current = distance < 80;
    setShowJump(distance > 320);
  }

  function jumpToBottom() {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }

  const labelFor = (id: TierId | null) =>
    tiers.find((item) => item.id === id)?.label ?? site.assistantName;
  const last = messages[messages.length - 1];
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar>
        <ModelPicker
          tiers={tiers}
          value={tierId}
          disabled={streaming}
          onChange={(next) => {
            setTierId(next);
            setPreferredTier(next);
            setRequestError(null);
          }}
        />
      </TopBar>

      {site.announcement ? (
        <div className="mx-3 mb-1 rounded-xl bg-accent-soft px-4 py-2 text-center text-[0.8125rem] text-accent">
          {site.announcement}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="scroll-area flex-1 overflow-y-auto">
          <div ref={contentRef} className="flex min-h-full flex-col">
            {messages.length === 0 ? (
              <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-10">
                <LogoMark size={52} />
                <h1 className="mt-6 text-center text-[1.7rem] font-semibold tracking-tight sm:text-3xl">
                  {firstName ? `Hello, ${firstName}.` : "Hello."} How can I help?
                </h1>
                <p className="mt-2 text-center text-fg-muted">{site.tagline}</p>
                <div className="mt-9 grid w-full gap-2.5 sm:grid-cols-2">
                  {SUGGESTIONS.map(({ icon: Icon, title, prompt }) => (
                    <button
                      key={title}
                      type="button"
                      disabled={streaming || exhausted}
                      onClick={() => void send(prompt)}
                      className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50"
                    >
                      <Icon size={18} className="mt-0.5 shrink-0 text-accent" />
                      <span>
                        <span className="block text-sm font-medium">{title}</span>
                        <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-fg-muted">
                          {prompt}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-4 pb-10">
                {hasEarlier ? (
                  <button
                    type="button"
                    onClick={loadEarlier}
                    disabled={loadingEarlier}
                    className="mx-auto rounded-full border border-border-strong px-4 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
                  >
                    {loadingEarlier ? "Loading…" : "Show earlier messages"}
                  </button>
                ) : null}
                {messages.map((message, index) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    modelLabel={labelFor(message.tier)}
                    canRegenerate={
                      !streaming &&
                      !exhausted &&
                      message.role === "assistant" &&
                      index === messages.length - 1
                    }
                    onRegenerate={regenerate}
                  />
                ))}
                {!streaming && last?.role === "user" ? (
                  <div className="flex items-center gap-3 text-sm text-fg-muted">
                    <span>No response was generated.</span>
                    <button
                      type="button"
                      onClick={regenerate}
                      disabled={exhausted}
                      className="flex items-center gap-1.5 font-medium text-accent hover:underline disabled:opacity-50"
                    >
                      <RefreshCw size={14} />
                      Try again
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label="Scroll to latest message"
            className="absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-strong bg-surface text-fg-muted shadow-pop hover:text-fg"
          >
            <ArrowDown size={17} />
          </button>
        ) : null}
      </div>

      <div className="shrink-0 px-3 pb-3 sm:px-4">
        <div className="mx-auto w-full max-w-3xl">
          {requestError ? <Alert className="mb-2.5">{requestError}</Alert> : null}
          {!requestError && exhausted && tier ? (
            <Alert tone="warning" className="mb-2.5">
              {!tier.included ? (
                <>
                  {tier.label} is not part of your plan.{" "}
                  <Link href="/settings/plan" className="font-medium underline underline-offset-2">
                    See plans
                  </Link>
                </>
              ) : (
                <>
                  {tier.blockedBy?.kind === "fiveHour"
                    ? `You have reached the 5-hour limit for ${tier.label}.`
                    : tier.blockedBy?.kind === "week"
                      ? `You have reached the weekly limit for ${tier.label}.`
                      : `You have used all of today's ${tier.label} messages.`}{" "}
                  {tier.blockedBy?.resetsAt ? (
                    <>
                      More become available at <LocalTime timestamp={tier.blockedBy.resetsAt} />
                    </>
                  ) : (
                    "More become available soon"
                  )}
                  {tiers.length > 1 ? " — or switch to another model above." : "."}{" "}
                  {plan.paid ? null : (
                    <Link href="/settings/plan" className="font-medium underline underline-offset-2">
                      Get higher limits
                    </Link>
                  )}
                </>
              )}
            </Alert>
          ) : null}
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={submitDraft}
            onStop={() => abortRef.current?.abort()}
            streaming={streaming}
            disabled={exhausted || !tier}
            maxLength={site.maxMessageChars}
            placeholder={`Message ${site.assistantName}`}
          />
          <p className="mt-2 px-2 text-center text-xs text-fg-subtle">
            {site.assistantName} can make mistakes. Check important information.
            {tier && remaining !== null && remaining > 0 ? ` ${tier.label}: ${allowanceText(tier)}.` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
