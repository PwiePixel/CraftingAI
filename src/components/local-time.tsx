"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Shows a point in time in the reader's own time zone. The server cannot know
 * that zone, so it renders UTC and the browser switches to local time.
 */
export function LocalTime({ timestamp, withDate = false }: { timestamp: number; withDate?: boolean }) {
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const date = new Date(timestamp);
  const sameDay = new Date().toDateString() === date.toDateString();
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    ...(withDate || (hydrated && !sameDay) ? { weekday: "short", month: "short", day: "numeric" } : {}),
    ...(hydrated ? {} : { timeZone: "UTC", timeZoneName: "short" }),
  };
  return (
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {new Intl.DateTimeFormat("en-US", options).format(date)}
    </time>
  );
}
