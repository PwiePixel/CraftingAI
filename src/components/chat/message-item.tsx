"use client";

import { memo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { LogoMark } from "@/components/logo";
import type { ChatMessage } from "@/lib/shared/types";
import { Markdown } from "./markdown";

export interface UiMessage extends ChatMessage {
  /** True while the reply is still being generated. */
  pending?: boolean;
  /** Explanation shown with a failed reply. */
  notice?: string;
}

const REFUSED_TEXT =
  "I'm not able to help with that request. Try rephrasing it, or ask me about something else.";

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {children}
      {label}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      label={copied ? "Copied" : "Copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard access can be denied; ignore.
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </ActionButton>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  modelLabel,
  canRegenerate,
  onRegenerate,
}: {
  message: UiMessage;
  modelLabel: string;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end" data-role="user">
        <div className="max-w-[85%] rounded-3xl bg-surface-2 px-5 py-2.5 text-[0.975rem] leading-relaxed break-words whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const waiting = message.pending && !message.content;
  const refused = message.status === "refused";
  const failed = message.status === "error";

  return (
    <div className="flex gap-3.5" data-role="assistant" data-status={message.status}>
      <LogoMark size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-fg-muted">{modelLabel}</p>

        {waiting ? (
          <div className="flex h-7 items-center gap-1.5" role="status" aria-label="Thinking">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : refused ? (
          <p className="text-[0.975rem] leading-relaxed text-fg-muted">{REFUSED_TEXT}</p>
        ) : message.content ? (
          <Markdown content={message.content} />
        ) : null}

        {message.status === "stopped" ? (
          <p className="mt-2 text-xs text-fg-subtle">You stopped this response.</p>
        ) : null}
        {message.status === "truncated" ? (
          <p className="mt-2 text-xs text-warning">
            This response reached the maximum length. Ask me to continue if you need the rest.
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="mt-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {message.notice ?? "The response could not be completed. Please try again."}
          </p>
        ) : null}

        {!message.pending ? (
          <div className="mt-1.5 -ml-2 flex items-center gap-0.5">
            {message.content && !refused ? <CopyButton text={message.content} /> : null}
            {canRegenerate ? (
              <ActionButton label={failed ? "Try again" : "Regenerate"} onClick={onRegenerate}>
                <RefreshCw size={14} />
              </ActionButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});
