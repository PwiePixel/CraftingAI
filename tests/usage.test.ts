import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/http";
import { getSettings, updateSettings } from "@/lib/server/settings";
import {
  assertWithinQuota,
  costMicroUsd,
  messagesUsedToday,
  publicTiers,
  recordUsage,
  spendTodayMicroUsd,
  tierLimit,
} from "@/lib/server/usage";
import { updateUser, findUserById } from "@/lib/server/users";
import { makeUser } from "./helpers";

const usage = (input: number, output: number) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

function quotaError(run: () => void): ApiError {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected an ApiError");
}

describe("cost estimation", () => {
  it("prices tokens per million, including cache reads and writes", () => {
    const tier = getSettings().tiers.pro; // $2 in / $10 out per million tokens
    expect(costMicroUsd(tier, usage(1_000_000, 0))).toBe(2_000_000);
    expect(costMicroUsd(tier, usage(0, 1_000_000))).toBe(10_000_000);
    expect(
      costMicroUsd(tier, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 }),
    ).toBe(200_000);
    expect(
      costMicroUsd(tier, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000 }),
    ).toBe(2_500_000);
  });
});

describe("daily limits", () => {
  it("counts chat messages per user and tier, but not title generation", async () => {
    const user = await makeUser();
    const settings = getSettings();
    recordUsage({ userId: user.id, kind: "chat", tierId: "lite", tier: settings.tiers.lite, usage: usage(10, 10) });
    recordUsage({ userId: user.id, kind: "title", tierId: "lite", tier: settings.tiers.lite, usage: usage(10, 10) });
    recordUsage({ userId: user.id, kind: "chat", tierId: "pro", tier: settings.tiers.pro, usage: usage(10, 10) });
    expect(messagesUsedToday(user.id, "lite")).toBe(1);
    expect(messagesUsedToday(user.id, "pro")).toBe(1);
    expect(messagesUsedToday(user.id, "ultra")).toBe(0);
  });

  it("blocks a tier once its allowance is used up", async () => {
    const user = await makeUser();
    const settings = getSettings();
    const limit = settings.tiers.ultra.dailyLimit;
    for (let i = 0; i < limit; i += 1) {
      assertWithinQuota(user, "ultra", settings);
      recordUsage({ userId: user.id, kind: "chat", tierId: "ultra", tier: settings.tiers.ultra, usage: usage(1, 1) });
    }
    const error = quotaError(() => assertWithinQuota(user, "ultra", settings));
    expect(error.status).toBe(429);
    expect(error.code).toBe("quota_exceeded");
    expect(error.retryAfter).toBeGreaterThan(0);
    // Other tiers stay available.
    expect(() => assertWithinQuota(user, "lite", settings)).not.toThrow();
  });

  it("applies the per-user multiplier and exempts administrators", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "admin" });
    const tier = getSettings().tiers.pro;
    expect(tierLimit(user, tier)).toBe(tier.dailyLimit);
    updateUser(user.id, { limit_multiplier: 2.5 });
    expect(tierLimit(findUserById(user.id)!, tier)).toBe(Math.floor(tier.dailyLimit * 2.5));
    updateUser(user.id, { limit_multiplier: 0 });
    expect(tierLimit(findUserById(user.id)!, tier)).toBe(0);
    expect(tierLimit(admin, tier)).toBeNull();
  });

  it("hides disabled tiers and never reveals the upstream model", async () => {
    const user = await makeUser();
    updateSettings({ tiers: { ultra: { enabled: false } } });
    const tiers = publicTiers(user, getSettings());
    expect(tiers.map((tier) => tier.id)).toEqual(["lite", "pro"]);
    expect(JSON.stringify(tiers)).not.toMatch(/claude|haiku|sonnet|opus/i);
    expect(quotaError(() => assertWithinQuota(user, "ultra", getSettings())).code).toBe("tier_unavailable");
    updateSettings({ tiers: { ultra: { enabled: true } } });
  });

  it("pauses everyone when the global daily budget is spent", async () => {
    const user = await makeUser();
    updateSettings({ dailyBudgetUsd: 0.01 });
    const settings = getSettings();
    recordUsage({ userId: user.id, kind: "chat", tierId: "ultra", tier: settings.tiers.ultra, usage: usage(0, 1_000_000) });
    expect(spendTodayMicroUsd()).toBeGreaterThanOrEqual(10_000);
    const error = quotaError(() => assertWithinQuota(user, "lite", settings));
    expect(error.status).toBe(503);
    expect(error.code).toBe("capacity_reached");
    updateSettings({ dailyBudgetUsd: 0 });
    expect(() => assertWithinQuota(user, "lite", getSettings())).not.toThrow();
  });
});
