"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatInt, formatUsd } from "@/lib/shared/format";

export interface ChartSeries {
  id: string;
  label: string;
  /** CSS colour, normally a `var(--series-n)` token. */
  color: string;
}

interface Props {
  /** ISO dates (YYYY-MM-DD), oldest first. */
  days: string[];
  series: ChartSeries[];
  /** One array per series id, aligned with `days`. */
  values: Record<string, number[]>;
  unit: "count" | "usd";
  /** Describes the chart for assistive technology. */
  label: string;
}

const HEIGHT = 220;
const MARGIN = { top: 10, right: 6, bottom: 24, left: 44 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const parseDay = (day: string) => new Date(`${day}T00:00:00Z`);

/** Rounds up to a clean axis maximum (1, 2, 2.5, 5 × 10ⁿ). */
function niceMax(value: number, unit: "count" | "usd"): number {
  if (value <= 0) return unit === "count" ? 4 : 0.01;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * base >= value) ?? 10;
  const result = step * base;
  return unit === "count" ? Math.max(4, Math.ceil(result)) : result;
}

function formatValue(value: number, unit: "count" | "usd"): string {
  return unit === "usd" ? formatUsd(value) : formatInt(value);
}

function formatTick(value: number, unit: "count" | "usd", max: number): string {
  if (unit === "count") return formatInt(value);
  if (value === 0) return "$0";
  return `$${value.toFixed(max < 0.1 ? 3 : max < 10 ? 2 : 0)}`;
}

/** Column with a rounded data end and a square baseline. */
function topRoundedPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, height, width / 2);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/**
 * Daily columns, stacked when there are several series. Values are available
 * on hover and in the table below the chart.
 */
export function ColumnChart({ days, series, values, unit, label }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.max(280, Math.round(next)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const totals = useMemo(
    () => days.map((_, index) => series.reduce((sum, item) => sum + (values[item.id]?.[index] ?? 0), 0)),
    [days, series, values],
  );
  const max = niceMax(Math.max(0, ...totals), unit);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotWidth / Math.max(1, days.length);
  const barWidth = Math.max(2, Math.min(MAX_BAR, band - GAP));
  const scale = (value: number) => (value / max) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(plotWidth / 64))));
  const baseline = MARGIN.top + plotHeight;

  const hoveredDay = hovered === null ? undefined : days[hovered];
  const tooltipLeft =
    hovered === null ? 0 : Math.min(Math.max(MARGIN.left + band * (hovered + 0.5), 96), width - 96);

  return (
    <div>
      <div ref={wrapperRef} className="relative" onPointerLeave={() => setHovered(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={label} className="block max-w-full">
          {ticks.map((tick) => {
            const y = baseline - scale(tick);
            return (
              <g key={tick}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
                <text
                  x={MARGIN.left - 8}
                  y={y}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--fg-subtle)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatTick(tick, unit, max)}
                </text>
              </g>
            );
          })}

          {days.map((day, index) => {
            const bandX = MARGIN.left + band * index;
            const x = bandX + (band - barWidth) / 2;
            const present = series.filter((item) => (values[item.id]?.[index] ?? 0) > 0);
            let cursor = baseline;
            return (
              <g key={day}>
                {hovered === index ? (
                  <rect x={bandX} y={MARGIN.top} width={band} height={plotHeight} fill="var(--surface-2)" />
                ) : null}
                {present.map((item, position) => {
                  const full = scale(values[item.id]?.[index] ?? 0);
                  // A 2px gap in the surface colour separates stacked segments.
                  const height = Math.max(1, full - (position > 0 ? GAP : 0));
                  const y = cursor - full;
                  cursor = y;
                  const isTop = position === present.length - 1;
                  return isTop ? (
                    <path key={item.id} d={topRoundedPath(x, y, barWidth, height)} fill={item.color} />
                  ) : (
                    <rect key={item.id} x={x} y={y} width={barWidth} height={height} fill={item.color} />
                  );
                })}
                {index % labelEvery === 0 ? (
                  <text
                    x={bandX + band / 2}
                    y={HEIGHT - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--fg-subtle)"
                  >
                    {dayFormat.format(parseDay(day))}
                  </text>
                ) : null}
                {/* The whole band is the hover target, not just the painted bar. */}
                <rect
                  x={bandX}
                  y={MARGIN.top}
                  width={band}
                  height={plotHeight}
                  fill="transparent"
                  onPointerEnter={() => setHovered(index)}
                  onPointerDown={() => setHovered(index)}
                />
              </g>
            );
          })}
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={baseline} y2={baseline} stroke="var(--border-strong)" strokeWidth={1} />
        </svg>

        {hovered !== null && hoveredDay ? (
          <div
            className="pointer-events-none absolute top-1 z-10 w-44 -translate-x-1/2 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-pop"
            style={{ left: tooltipLeft }}
          >
            <p className="text-fg-muted">{longDayFormat.format(parseDay(hoveredDay))}</p>
            {series.length > 1 ? (
              <p className="mt-0.5 text-sm font-semibold">
                {formatValue(totals[hovered] ?? 0, unit)}
                <span className="ml-1 text-xs font-normal text-fg-muted">total</span>
              </p>
            ) : null}
            <ul className="mt-1 flex flex-col gap-0.5">
              {series.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: item.color }} />
                  <span className="font-semibold tabular-nums">
                    {formatValue(values[item.id]?.[hovered] ?? 0, unit)}
                  </span>
                  <span className="truncate text-fg-muted">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {series.length > 1 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Legend">
          {series.map((item) => (
            <li key={item.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="mt-3 text-xs">
        <summary className="w-fit rounded text-fg-muted hover:text-fg">View as table</summary>
        <div className="scroll-area mt-2 max-h-64 overflow-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left tabular-nums">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className="px-3 py-1.5 font-medium">Day (UTC)</th>
                {series.map((item) => (
                  <th key={item.id} className="px-3 py-1.5 text-right font-medium">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days
                .map((day, index) => ({ day, index }))
                .reverse()
                .map(({ day, index }) => (
                  <tr key={day} className="border-t border-border">
                    <td className="px-3 py-1.5">{day}</td>
                    {series.map((item) => (
                      <td key={item.id} className="px-3 py-1.5 text-right">
                        {formatValue(values[item.id]?.[index] ?? 0, unit)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
