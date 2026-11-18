"use client";

import { useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/shared/cn";

const MAX_HEIGHT = 220;

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  disabled,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
  maxLength: number;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content, up to a maximum height.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
    element.style.overflowY = element.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const tooLong = value.length > maxLength;
  const canSend = !streaming && !disabled && value.trim().length > 0 && !tooLong;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (canSend) onSubmit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a line break. Ignore Enter while an
    // input method editor is composing text.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "rounded-[1.75rem] border bg-surface shadow-sm transition-colors",
        "focus-within:border-fg-subtle",
        tooLong ? "border-danger" : "border-border-strong",
      )}
    >
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="scroll-area block w-full resize-none bg-transparent px-5 pt-4 pb-1 text-[0.975rem] leading-relaxed placeholder:text-fg-subtle focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3 px-3 pt-1 pb-3">
        <span className={cn("pl-2 text-xs", tooLong ? "text-danger" : "text-fg-subtle")}>
          {value.length > maxLength * 0.8
            ? `${value.length.toLocaleString("en-US")} / ${maxLength.toLocaleString("en-US")}`
            : ""}
        </span>
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg transition-opacity hover:opacity-85"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-fg transition-colors hover:bg-accent-hover disabled:bg-surface-3 disabled:text-fg-subtle"
          >
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </form>
  );
}
