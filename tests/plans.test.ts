import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/server/db";
import { ApiError } from "@/lib/server/http";
import { activePaidPlan, planCards, publicPlan } from "@/lib/server/plans";
import { getSettings, updateSettings } from "@/lib/server/settings";
import { assertWithinQuota, publicTier, tierAllowance } from "@/lib/server/usage";
import { findUserById, updateUser, type UserRow } from "@/lib/server/users";
import { DEFAULT_BILLING, formatPrice, planIdFromName } from "@/lib/shared/billing-schema";
import type { TierId } from "@/lib/shared/types";
import { makeUser } from "./helpers";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Records chat messages at given points in the past. */
function addMessages(user: UserRow, tier: TierId, agesMs: number[]): void {
  const insert = getDb().prepare(
    `INSERT INTO usage_events (user_id, kind, tier, model, day, created_at) VALUES (?, 'chat', ?, 'test', ?, ?)`,
  );
  for (const age of agesMs) {
    const at = Date.now() - age;
    insert.run(user.id, tier, new Date(at).toISOString().slice(0, 10), at);
  }
}

async function subscriber(planId = "plus"): Promise<UserRow> {
  const user = await makeUser();
  updateUser(user.id, { plan_id: planId, plan_source: "manual" });
  return findUserById(user.id)!;
}

function quotaError(run: () => void): ApiError {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected an ApiError");
}

describe("plan entitlement", () => {
  it("defaults to the free plan", async () => {
    const user = await makeUser();
    expect(activePaidPlan(user, getSettings())).toBeNull();
    expect(publicPlan(user, getSettings())).toEqual({ id: "free", name: "Free", paid: false });
  });

  it("honours a plan assigned by an administrator", async () => {
    const user = await subscriber("pro");
    expect(publicPlan(user, getSettings())).toEqual({ id: "pro", name: "Pro", paid: true });
  });

  it("follows the state of a paid subscription", async () => {
    const user = await makeUser();
    const base = { plan_id: "plus", plan_source: "stripe" as const, plan_period_end: Date.now() + 10 * DAY };
    const settings = getSettings();
    for (const status of ["active", "trialing", "past_due"]) {
      expect(activePaidPlan({ ...user, ...base, plan_status: status }, settings)?.id).toBe("plus");
    }
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", null]) {
      expect(activePaidPlan({ ...user, ...base, plan_status: status }, settings)).toBeNull();
    }
  });

  it("ends shortly after the paid period, even if no notice arrived", async () => {
    const user = await makeUser();
    const base = { plan_id: "plus", plan_source: "stripe" as const, plan_status: "active" };
    const settings = getSettings();
    expect(activePaidPlan({ ...user, ...base, plan_period_end: Date.now() - 1 * DAY }, settings)).not.toBeNull();
    expect(activePaidPlan({ ...user, ...base, plan_period_end: Date.now() - 4 * DAY }, settings)).toBeNull();
  });

  it("falls back to free when the plan no longer exists", async () => {
    const user = await subscriber("vanished");
    expect(publicPlan(user, getSettings()).paid).toBe(false);
  });
});

describe("limits of paid plans", () => {
  it("uses a 5-hour and a weekly window instead of the daily limit", async () => {
    const user = await subscriber("plus");
    const allowance = tierAllowance(user, "pro", getSettings());
    expect(allowance.included).toBe(true);
    expect(allowance.windows.map((window) => [window.kind, window.limit])).toEqual([
      ["fiveHour", DEFAULT_BILLING.plans[0]!.limits.pro.fiveHour],
      ["week", DEFAULT_BILLING.plans[0]!.limits.pro.weekly],
    ]);
  });

  it("counts only messages inside each window", async () => {
    const user = await subscriber("plus");
    addMessages(user, "pro", [1 * HOUR, 2 * HOUR, 6 * HOUR, 3 * DAY, 8 * DAY]);
    const [fiveHour, week] = tierAllowance(user, "pro", getSettings()).windows;
    expect(fiveHour!.used).toBe(2);
    expect(week!.used).toBe(4);
  });

  it("blocks at the 5-hour limit and says when room frees up", async () => {
    const user = await subscriber("plus");
    const limit = DEFAULT_BILLING.plans[0]!.limits.ultra.fiveHour; // 8
    // The oldest of the eight messages was sent four hours ago.
    addMessages(user, "ultra", [4 * HOUR, ...Array.from({ length: limit - 1 }, (_, index) => (index + 1) * 60_000)]);

    const tier = publicTier(user, "ultra", getSettings());
    expect(tier.remaining).toBe(0);
    expect(tier.blockedBy?.kind).toBe("fiveHour");
    const minutes = Math.round((tier.blockedBy!.resetsAt! - Date.now()) / 60_000);
    expect(minutes).toBe(60); // one hour until that oldest message is five hours old

    const error = quotaError(() => assertWithinQuota(user, "ultra", getSettings()));
    expect(error.status).toBe(429);
    expect(error.message).toMatch(/5-hour limit/);
    expect(error.retryAfter).toBeGreaterThan(3500);
    // Other models are unaffected.
    expect(() => assertWithinQuota(user, "lite", getSettings())).not.toThrow();
  });

  it("blocks at the weekly limit although the 5-hour window has room", async () => {
    const user = await subscriber("plus");
    const weekly = DEFAULT_BILLING.plans[0]!.limits.ultra.weekly; // 50
    addMessages(user, "ultra", Array.from({ length: weekly }, (_, index) => 6 * HOUR + index * HOUR * 2));
    const tier = publicTier(user, "ultra", getSettings());
    expect(tier.windows.find((window) => window.kind === "fiveHour")!.used).toBe(0);
    expect(tier.blockedBy?.kind).toBe("week");
    expect(quotaError(() => assertWithinQuota(user, "ultra", getSettings())).message).toMatch(/weekly limit/);
  });

  it("frees room again as messages age out of the window", async () => {
    const user = await subscriber("plus");
    const limit = DEFAULT_BILLING.plans[0]!.limits.ultra.fiveHour;
    addMessages(user, "ultra", Array.from({ length: limit }, () => 5 * HOUR + 60_000));
    expect(publicTier(user, "ultra", getSettings()).remaining).toBe(limit);
    expect(() => assertWithinQuota(user, "ultra", getSettings())).not.toThrow();
  });

  it("leaves out models that a plan does not contain", async () => {
    updateSettings({
      billing: {
        ...getSettings().billing,
        plans: getSettings().billing.plans.map((plan) =>
          plan.id === "plus" ? { ...plan, limits: { ...plan.limits, ultra: { fiveHour: 0, weekly: 0 } } } : plan,
        ),
      },
    });
    const user = await subscriber("plus");
    expect(publicTier(user, "ultra", getSettings())).toMatchObject({ included: false, remaining: 0 });
    const error = quotaError(() => assertWithinQuota(user, "ultra", getSettings()));
    expect(error.code).toBe("tier_not_in_plan");
    updateSettings({ billing: DEFAULT_BILLING });
  });

  it("keeps the daily limit for the free plan and no limit for administrators", async () => {
    const free = await makeUser();
    const admin = await makeUser({ role: "admin" });
    const settings = getSettings();
    expect(tierAllowance(free, "lite", settings).windows.map((window) => window.kind)).toEqual(["day"]);
    expect(publicTier(free, "lite", settings).remaining).toBe(settings.tiers.lite.dailyLimit);
    expect(publicTier(admin, "ultra", settings)).toMatchObject({ included: true, remaining: null, windows: [] });
  });

  it("applies the per-user multiplier to plan limits", async () => {
    const user = await subscriber("plus");
    updateUser(user.id, { limit_multiplier: 2 });
    const [fiveHour] = tierAllowance(findUserById(user.id)!, "pro", getSettings()).windows;
    expect(fiveHour!.limit).toBe(DEFAULT_BILLING.plans[0]!.limits.pro.fiveHour * 2);
  });
});

describe("plans as shown to visitors", () => {
  it("lists the free plan first, then the plans that can be bought, with prices from the settings", () => {
    const cards = planCards(getSettings());
    expect(cards.map((card) => card.id)).toEqual(["free", "plus", "pro"]);
    expect(cards[0]).toMatchObject({ paid: false, price: null });
    expect(cards[1]!.price).toBe("€7.99");
    expect(cards[1]!.limits[0]).toMatch(/every 5 hours, .* per week/);
    expect(JSON.stringify(cards)).not.toMatch(/claude|haiku|sonnet|opus/i);
  });

  it("hides plans that are switched off", () => {
    const billing = getSettings().billing;
    updateSettings({ billing: { ...billing, plans: billing.plans.map((plan) => ({ ...plan, enabled: plan.id !== "pro" })) } });
    expect(planCards(getSettings()).map((card) => card.id)).toEqual(["free", "plus"]);
    updateSettings({ billing: DEFAULT_BILLING });
  });

  it("validates plan definitions", () => {
    const billing = getSettings().billing;
    const withPlan = (patch: object) => ({ billing: { ...billing, plans: [{ ...billing.plans[0]!, ...patch }] } });
    expect(() => updateSettings(withPlan({ priceCents: 0 }))).toThrow();
    expect(() => updateSettings(withPlan({ id: "free" }))).toThrow();
    expect(() => updateSettings(withPlan({ id: "Bad Id" }))).toThrow();
    expect(() => updateSettings({ billing: { ...billing, currency: "euro" } })).toThrow();
    expect(() => updateSettings({ billing: { ...billing, plans: [billing.plans[0], billing.plans[0]] } })).toThrow();
  });

  it("formats prices and derives identifiers", () => {
    expect(formatPrice(1999, "eur")).toBe("€19.99");
    expect(formatPrice(500, "usd")).toBe("$5.00");
    expect(planIdFromName("Team Plan!", [])).toBe("team-plan");
    expect(planIdFromName("Plus", ["plus"])).toBe("plus-2");
    expect(planIdFromName("Free", [])).toBe("free-2");
  });
});
