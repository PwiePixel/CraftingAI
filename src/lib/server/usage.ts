import "server-only";
import { getDb } from "./db";
import { ApiError } from "./http";
import type { UserRow } from "./users";
import { activePaidPlan } from "./plans";
import { FIVE_HOURS_MS, WEEK_MS } from "@/lib/shared/billing-schema";
import type { Settings, TierSettings } from "@/lib/shared/settings-schema";
import { TIER_IDS, type PublicTier, type TierId, type UsageWindow } from "@/lib/shared/types";

export interface UpstreamUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function emptyUsage(): UpstreamUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

/** Usage is counted per UTC calendar day. */
export function utcDay(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function secondsUntilUtcMidnight(now = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
}

/**
 * Estimated cost in millionths of a US dollar. A price in USD per million
 * tokens equals micro-USD per token. Cache writes cost about 1.25x and cache
 * reads at most 0.1x of the regular input price.
 */
export function costMicroUsd(tier: TierSettings, usage: UpstreamUsage): number {
  const input = tier.inputPricePerMTok;
  return Math.round(
    usage.inputTokens * input +
      usage.cacheWriteTokens * input * 1.25 +
      usage.cacheReadTokens * input * 0.1 +
      usage.outputTokens * tier.outputPricePerMTok,
  );
}

/** Rough token count for text the provider never reported on (about 3 characters per token, on the high side). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

const INSERT_USAGE = `INSERT INTO usage_events
    (user_id, kind, tier, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micro_usd, day, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function recordUsage(event: {
  userId: string | null;
  kind: "chat" | "title";
  tierId: TierId;
  tier: TierSettings;
  usage: UpstreamUsage;
}): void {
  getDb()
    .prepare(INSERT_USAGE)
    .run(
      event.userId,
      event.kind,
      event.tierId,
      event.tier.model,
      event.usage.inputTokens,
      event.usage.outputTokens,
      event.usage.cacheReadTokens,
      event.usage.cacheWriteTokens,
      costMicroUsd(event.tier, event.usage),
      utcDay(),
      Date.now(),
    );
}

/**
 * Books a chat message *before* the provider is called. From this moment the
 * message counts against the user's daily allowance, and its worst-case cost
 * counts against the daily budget, so neither can be dodged by cancelling
 * early or by sending many requests at once. `settleUsage` later replaces the
 * worst case with the real numbers.
 */
export function reserveUsage(event: {
  userId: string;
  tierId: TierId;
  tier: TierSettings;
  promptChars: number;
}): number {
  const worstCase: UpstreamUsage = {
    inputTokens: 0,
    outputTokens: event.tier.maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: estimateTokens(event.promptChars),
  };
  const result = getDb()
    .prepare(INSERT_USAGE)
    .run(
      event.userId,
      "chat",
      event.tierId,
      event.tier.model,
      0,
      0,
      0,
      0,
      costMicroUsd(event.tier, worstCase),
      utcDay(),
      Date.now(),
    );
  return Number(result.lastInsertRowid);
}

export function settleUsage(reservationId: number, tier: TierSettings, usage: UpstreamUsage): void {
  getDb()
    .prepare(
      `UPDATE usage_events
          SET input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ?, cost_micro_usd = ?
        WHERE id = ?`,
    )
    .run(
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
      costMicroUsd(tier, usage),
      reservationId,
    );
}

/** Cancels a reservation for a request the provider never worked on. */
export function releaseUsage(reservationId: number): void {
  getDb().prepare("DELETE FROM usage_events WHERE id = ?").run(reservationId);
}

export function messagesUsedToday(userId: string, tierId: TierId): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM usage_events WHERE user_id = ? AND day = ? AND tier = ? AND kind = 'chat'",
    )
    .get(userId, utcDay(), tierId) as { n: number };
  return row.n;
}

export function spendTodayMicroUsd(): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(cost_micro_usd), 0) AS total FROM usage_events WHERE day = ?")
    .get(utcDay()) as { total: number };
  return row.total;
}

/** Daily message allowance on the free plan; `null` means unlimited (administrators). */
export function tierLimit(user: Pick<UserRow, "role" | "limit_multiplier">, tier: TierSettings) {
  if (user.role === "admin") return null;
  return Math.max(0, Math.floor(tier.dailyLimit * user.limit_multiplier));
}

/** Chat messages of a user on one model since `since`, and when the n-th oldest of them was sent. */
function recentMessages(userId: string, tierId: TierId, since: number, skip: number) {
  const db = getDb();
  const count = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM usage_events WHERE user_id = ? AND kind = 'chat' AND tier = ? AND created_at > ?",
      )
      .get(userId, tierId, since) as { n: number }
  ).n;
  const row = db
    .prepare(
      `SELECT created_at FROM usage_events
        WHERE user_id = ? AND kind = 'chat' AND tier = ? AND created_at > ?
        ORDER BY created_at ASC LIMIT 1 OFFSET ?`,
    )
    .get(userId, tierId, since, Math.max(0, skip)) as { created_at: number } | undefined;
  return { count, at: row?.created_at ?? null };
}

/**
 * A rolling limit: at most `limit` messages within any period of `windowMs`.
 * Room frees up as earlier messages age out of the window.
 */
function rollingWindow(
  kind: "fiveHour" | "week",
  userId: string,
  tierId: TierId,
  limit: number,
  windowMs: number,
  now: number,
): UsageWindow {
  const since = now - windowMs;
  const used = recentMessages(userId, tierId, since, 0).count;
  // When the limit is reached, the next message becomes possible once enough
  // of the oldest ones have left the window.
  const pivot = recentMessages(userId, tierId, since, Math.max(0, used - limit)).at;
  return { kind, limit, used, resetsAt: pivot === null ? null : pivot + windowMs };
}

export interface TierAllowance {
  included: boolean;
  /** Empty for administrators, who are not limited. */
  windows: UsageWindow[];
}

/** The limits that apply to a user for one model, depending on their plan. */
export function tierAllowance(
  user: UserRow,
  tierId: TierId,
  settings: Settings,
  now = Date.now(),
): TierAllowance {
  const tier = settings.tiers[tierId];
  if (user.role === "admin") return { included: true, windows: [] };

  const plan = activePaidPlan(user, settings, now);
  if (!plan) {
    const limit = Math.max(0, Math.floor(tier.dailyLimit * user.limit_multiplier));
    return {
      included: true,
      windows: [
        {
          kind: "day",
          limit,
          used: messagesUsedToday(user.id, tierId),
          resetsAt: now + secondsUntilUtcMidnight(now) * 1000,
        },
      ],
    };
  }

  const limits = plan.limits[tierId];
  if (limits.fiveHour <= 0 || limits.weekly <= 0) return { included: false, windows: [] };
  const scale = (value: number) => Math.max(0, Math.floor(value * user.limit_multiplier));
  return {
    included: true,
    windows: [
      rollingWindow("fiveHour", user.id, tierId, scale(limits.fiveHour), FIVE_HOURS_MS, now),
      rollingWindow("week", user.id, tierId, scale(limits.weekly), WEEK_MS, now),
    ],
  };
}

export function publicTier(user: UserRow, tierId: TierId, settings: Settings): PublicTier {
  const tier = settings.tiers[tierId];
  const allowance = tierAllowance(user, tierId, settings);
  const blockedBy = allowance.windows.find((window) => window.used >= window.limit) ?? null;
  const remaining =
    allowance.windows.length === 0
      ? allowance.included
        ? null
        : 0
      : Math.max(0, Math.min(...allowance.windows.map((window) => window.limit - window.used)));
  return {
    id: tierId,
    label: tier.label,
    description: tier.description,
    enabled: tier.enabled,
    included: allowance.included,
    remaining,
    blockedBy,
    windows: allowance.windows,
  };
}

export function publicTiers(user: UserRow, settings: Settings): PublicTier[] {
  return TIER_IDS.map((id) => publicTier(user, id, settings)).filter((tier) => tier.enabled);
}

const WINDOW_NAMES: Record<UsageWindow["kind"], string> = {
  day: "daily",
  fiveHour: "5-hour",
  week: "weekly",
};

/** Throws when the user may not send another message with this tier right now. */
export function assertWithinQuota(user: UserRow, tierId: TierId, settings: Settings): void {
  const tier = settings.tiers[tierId];
  if (!tier.enabled) {
    throw new ApiError(400, "tier_unavailable", "This model is currently not available.");
  }
  if (settings.dailyBudgetUsd > 0 && spendTodayMicroUsd() >= settings.dailyBudgetUsd * 1_000_000) {
    throw new ApiError(
      503,
      "capacity_reached",
      "We have reached today's capacity. Please come back tomorrow.",
      secondsUntilUtcMidnight(),
    );
  }

  const now = Date.now();
  const allowance = tierAllowance(user, tierId, settings, now);
  if (!allowance.included) {
    throw new ApiError(403, "tier_not_in_plan", `${tier.label} is not part of your plan.`);
  }
  const blocked = allowance.windows.find((window) => window.used >= window.limit);
  if (blocked) {
    const retryAfter = blocked.resetsAt ? Math.max(1, Math.ceil((blocked.resetsAt - now) / 1000)) : 3600;
    const message =
      blocked.kind === "day"
        ? `You have used all of today's ${tier.label} messages. The limit resets at midnight UTC — or switch to another model.`
        : `You have reached the ${WINDOW_NAMES[blocked.kind]} limit for ${tier.label}. More messages become available soon — or switch to another model.`;
    throw new ApiError(429, "quota_exceeded", message, retryAfter);
  }
}

/** Generous ceiling on chat requests per day, whatever their outcome. */
export function dailyRequestCeiling(user: UserRow, settings: Settings): number {
  if (user.role === "admin") return 6_000;
  const plan = activePaidPlan(user, settings);
  const perDay = TIER_IDS.reduce((sum, id) => {
    if (!plan) return sum + (tierLimit(user, settings.tiers[id]) ?? 0);
    // At most five full 5-hour windows fit into a day.
    return sum + Math.floor(plan.limits[id].fiveHour * user.limit_multiplier) * 5;
  }, 0);
  return 50 + perDay * 3;
}
