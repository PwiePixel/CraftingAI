import "server-only";
import { getDb } from "./db";
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
} from "@/lib/shared/settings-schema";
import type { PublicSite } from "@/lib/shared/types";

const KEY = "app";

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively overlays `patch` on `base`. Arrays and scalars are replaced. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : patch) as T;
  }
  const result: Json = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = key in base ? deepMerge((base as Json)[key], value) : value;
  }
  return result as T;
}

/** Defaults, seeded once from the environment written by the installer. */
function defaults(): Settings {
  const fromEnv: Json = {};
  const legal: Json = {};
  if (process.env.SITE_NAME) {
    fromEnv.siteName = process.env.SITE_NAME;
    legal.operatorName = process.env.OPERATOR_NAME ?? process.env.SITE_NAME;
  }
  if (process.env.ASSISTANT_NAME) fromEnv.assistantName = process.env.ASSISTANT_NAME;
  if (process.env.CONTACT_EMAIL) legal.contactEmail = process.env.CONTACT_EMAIL;
  if (process.env.LEGAL_EFFECTIVE_DATE) legal.effectiveDate = process.env.LEGAL_EFFECTIVE_DATE;
  if (process.env.DAILY_BUDGET_USD && Number.isFinite(Number(process.env.DAILY_BUDGET_USD))) {
    fromEnv.dailyBudgetUsd = Number(process.env.DAILY_BUDGET_USD);
  }
  fromEnv.legal = legal;
  const merged = deepMerge(DEFAULT_SETTINGS, fromEnv);
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

const cacheStore = globalThis as unknown as {
  __craftingSettings?: { value: Settings; loadedAt: number };
};

/** Settings change rarely, so they are cached briefly in memory. */
const CACHE_MS = 5_000;

export function getSettings(): Settings {
  const cached = cacheStore.__craftingSettings;
  if (cached && Date.now() - cached.loadedAt < CACHE_MS) return cached.value;

  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(KEY) as
    | { value: string }
    | undefined;
  let stored: unknown = {};
  if (row) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      stored = {};
    }
  }
  const base = defaults();
  const parsed = settingsSchema.safeParse(deepMerge(base, stored));
  const value = parsed.success ? parsed.data : base;
  cacheStore.__craftingSettings = { value, loadedAt: Date.now() };
  return value;
}

/** Validates and stores a partial update. Throws a ZodError when invalid. */
export function updateSettings(patch: unknown): Settings {
  const next = settingsSchema.parse(deepMerge(getSettings(), patch));
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(KEY, JSON.stringify(next), Date.now());
  cacheStore.__craftingSettings = { value: next, loadedAt: Date.now() };
  return next;
}

export function invalidateSettingsCache(): void {
  cacheStore.__craftingSettings = undefined;
}

/** The subset of settings that may be sent to any visitor. */
export function publicSite(settings: Settings = getSettings()): PublicSite {
  return {
    siteName: settings.siteName,
    assistantName: settings.assistantName,
    tagline: settings.tagline,
    announcement: settings.announcement,
    registrationOpen: settings.registrationOpen,
    maxMessageChars: settings.maxMessageChars,
    defaultTier: settings.defaultTier,
    legal: {
      ...settings.legal,
      operatorName: settings.legal.operatorName || settings.siteName,
    },
  };
}
