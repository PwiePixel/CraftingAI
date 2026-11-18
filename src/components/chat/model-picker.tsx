"use client";

import { useCallback, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles, Zap, Gem } from "lucide-react";
import { useDismiss } from "@/lib/client/use-dismiss";
import { cn } from "@/lib/shared/cn";
import type { PublicTier, TierId } from "@/lib/shared/types";

const tierIcons: Record<TierId, typeof Zap> = { lite: Zap, pro: Sparkles, ultra: Gem };

export function remainingMessages(tier: PublicTier): number | null {
  return tier.remaining;
}

const windowNames = { day: "today", fiveHour: "in this 5-hour window", week: "this week" } as const;

/** One line that says how much room is left on a model, or why there is none. */
export function allowanceText(tier: PublicTier): string {
  if (!tier.included) return "Not part of your plan";
  if (tier.remaining === null) return "Unlimited";
  if (tier.blockedBy) {
    return tier.blockedBy.kind === "day"
      ? "Daily limit reached"
      : tier.blockedBy.kind === "fiveHour"
        ? "5-hour limit reached"
        : "Weekly limit reached";
  }
  // The tightest limit decides how many messages are left.
  const tightest = [...tier.windows].sort((a, b) => a.limit - a.used - (b.limit - b.used))[0];
  return tightest ? `${tier.remaining} left ${windowNames[tightest.kind]}` : `${tier.remaining} left`;
}

export function ModelPicker({
  tiers,
  value,
  onChange,
  disabled,
}: {
  tiers: PublicTier[];
  value: TierId;
  onChange: (tier: TierId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  const current = tiers.find((tier) => tier.id === value) ?? tiers[0];
  if (!current) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((state) => !state)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.95rem] font-semibold transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        {current.label}
        <ChevronDown size={16} className="text-fg-subtle" />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="Model"
          className="animate-pop absolute top-full left-0 z-30 mt-1.5 w-[19rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-surface p-1.5 shadow-pop"
        >
          {tiers.map((tier) => {
            const Icon = tierIcons[tier.id];
            const exhausted = remainingMessages(tier) === 0;
            const selected = tier.id === current.id;
            return (
              <button
                key={tier.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(tier.id);
                  close();
                }}
                className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    selected ? "bg-accent-soft text-accent" : "bg-surface-2 text-fg-muted",
                  )}
                >
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{tier.label}</span>
                  <span className="block text-xs leading-relaxed text-fg-muted">{tier.description}</span>
                  <span
                    className={cn(
                      "mt-0.5 block text-xs",
                      exhausted ? "text-warning" : "text-fg-subtle",
                    )}
                  >
                    {allowanceText(tier)}
                  </span>
                </span>
                {selected ? <Check size={16} className="mt-1 shrink-0 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
