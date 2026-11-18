import "server-only";
import { getDb } from "./db";
import { ApiError } from "./http";
import type { UserRow } from "./users";
import type { Settings, TierSettings } from "@/lib/shared/settings-schema";
import { TIER_IDS, type PublicTier, type TierId } from "@/lib/shared/types";

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

/** Daily message allowance for a user; `null` means unlimited (administrators). */
export function tierLimit(user: Pick<UserRow, "role" | "limit_multiplier">, tier: TierSettings) {
  if (user.role === "admin") return null;
  return Math.max(0, Math.floor(tier.dailyLimit * user.limit_multiplier));
}

export function publicTier(user: UserRow, tierId: TierId, settings: Settings): PublicTier {
  const tier = settings.tiers[tierId];
  return {
    id: tierId,
    label: tier.label,
    description: tier.description,
    enabled: tier.enabled,
    limit: tierLimit(user, tier),
    used: messagesUsedToday(user.id, tierId),
  };
}

export function publicTiers(user: UserRow, settings: Settings): PublicTier[] {
  return TIER_IDS.map((id) => publicTier(user, id, settings)).filter((tier) => tier.enabled);
}

/** Throws when the user may not send another message with this tier right now. */
export function assertWithinQuota(user: UserRow, tierId: TierId, settings: Settings): void {
  const tier = settings.tiers[tierId];
  if (!tier.enabled) {
    throw new ApiError(400, "tier_unavailable", "This model is currently not available.");
  }
  const retryAfter = secondsUntilUtcMidnight();
  if (settings.dailyBudgetUsd > 0 && spendTodayMicroUsd() >= settings.dailyBudgetUsd * 1_000_000) {
    throw new ApiError(
      503,
      "capacity_reached",
      "We have reached today's capacity. Please come back tomorrow.",
      retryAfter,
    );
  }
  const limit = tierLimit(user, tier);
  if (limit !== null && messagesUsedToday(user.id, tierId) >= limit) {
    throw new ApiError(
      429,
      "quota_exceeded",
      `You have used all of today's ${tier.label} messages. The limit resets at midnight UTC — or switch to another model.`,
      retryAfter,
    );
  }
}
