"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ThemePreference } from "@/lib/shared/types";

const listeners = new Set<() => void>();

function read(): ThemePreference {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The preference lives in a cookie so the server can render the right theme
 * on first paint, without any inline script.
 */
export function useTheme(initial: ThemePreference): [ThemePreference, (next: ThemePreference) => void] {
  const theme = useSyncExternalStore(subscribe, read, () => initial);

  const setTheme = useCallback((next: ThemePreference) => {
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    listeners.forEach((listener) => listener());
  }, []);

  return [theme, setTheme];
}
