import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-[0.8125rem] text-fg-muted">{label}</p>
      <p className="mt-1.5 text-[1.7rem] leading-none font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-2 text-xs text-fg-muted">{detail}</p> : null}
      {children}
    </div>
  );
}

/** Progress towards a limit. The label states the level, so colour is never the only cue. */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const level = ratio >= 1 ? "critical" : ratio >= 0.75 ? "warning" : "ok";
  return (
    <div className="mt-3">
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full"
        style={{ background: `var(--meter-${level}-track)` }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${ratio * 100}%`, background: `var(--meter-${level})` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-fg-muted">{label}</p>
    </div>
  );
}
