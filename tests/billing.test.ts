import Stripe from "stripe";
import { beforeAll, describe, expect, it } from "vitest";
import { applySubscription, handleWebhookEvent, parseWebhook } from "@/lib/server/billing";
import { ApiError } from "@/lib/server/http";
import { publicPlan } from "@/lib/server/plans";
import { getSettings } from "@/lib/server/settings";
import { findUserById, updateUser, type UserRow } from "@/lib/server/users";
import { makeUser } from "./helpers";

const SECRET = "whsec_test_0123456789abcdef";

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_0123456789abcdef";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});

let counter = 0;
function subscription(
  user: UserRow,
  patch: Partial<{ id: string; status: string; planId: string; cancel: boolean; periodEnd: number }> = {},
): Stripe.Subscription {
  counter += 1;
  return {
    id: patch.id ?? `sub_test_${counter}`,
    object: "subscription",
    customer: `cus_${user.id}`,
    status: patch.status ?? "active",
    cancel_at_period_end: patch.cancel ?? false,
    metadata: { userId: user.id, planId: patch.planId ?? "plus" },
    items: { data: [{ current_period_end: patch.periodEnd ?? Math.floor(Date.now() / 1000) + 30 * 86_400 }] },
  } as unknown as Stripe.Subscription;
}

const reload = (user: UserRow) => findUserById(user.id)!;

describe("subscriptions", () => {
  it("gives access to the plan while the subscription is active", async () => {
    const user = await makeUser();
    const active = subscription(user, { planId: "pro" });
    applySubscription(active);
    const row = reload(user);
    expect(row).toMatchObject({
      plan_id: "pro",
      plan_source: "stripe",
      plan_status: "active",
      stripe_subscription_id: active.id,
      stripe_customer_id: `cus_${user.id}`,
      plan_cancel_at_period_end: 0,
    });
    expect(row.plan_period_end).toBeGreaterThan(Date.now());
    expect(publicPlan(row, getSettings())).toMatchObject({ id: "pro", paid: true });
  });

  it("records a scheduled cancellation and keeps the plan until the period ends", async () => {
    const user = await makeUser();
    const active = subscription(user);
    applySubscription(active);
    applySubscription({ ...active, cancel_at_period_end: true } as Stripe.Subscription);
    expect(reload(user).plan_cancel_at_period_end).toBe(1);
    expect(publicPlan(reload(user), getSettings()).paid).toBe(true);
  });

  it("returns to the free plan when the subscription ends", async () => {
    const user = await makeUser();
    const active = subscription(user);
    applySubscription(active);
    applySubscription({ ...active, status: "canceled" } as Stripe.Subscription);
    expect(reload(user)).toMatchObject({ plan_id: "free", plan_source: "none", stripe_subscription_id: null });
    // The billing account is kept for later purchases.
    expect(reload(user).stripe_customer_id).toBe(`cus_${user.id}`);
  });

  it("ignores the end of an older subscription after switching plans", async () => {
    const user = await makeUser();
    const old = subscription(user, { planId: "plus" });
    applySubscription(old);
    const next = subscription(user, { planId: "pro" });
    applySubscription(next, true); // a checkout for the new plan was completed
    applySubscription({ ...old, status: "canceled" } as Stripe.Subscription);
    expect(reload(user)).toMatchObject({ plan_id: "pro", stripe_subscription_id: next.id });
  });

  it("does not let an unrelated subscription replace one in good standing", async () => {
    const user = await makeUser();
    const current = subscription(user, { planId: "pro" });
    applySubscription(current);
    applySubscription(subscription(user, { planId: "plus" }));
    expect(reload(user)).toMatchObject({ plan_id: "pro", stripe_subscription_id: current.id });
  });

  it("does not grant anything before the first payment has gone through", async () => {
    const user = await makeUser();
    applySubscription(subscription(user, { status: "incomplete" }));
    expect(reload(user).plan_id).toBe("free");
  });

  it("leaves a plan assigned by an administrator alone when an unknown subscription ends", async () => {
    const user = await makeUser();
    updateUser(user.id, { plan_id: "pro", plan_source: "manual" });
    applySubscription(subscription(user, { status: "canceled" }));
    expect(reload(user)).toMatchObject({ plan_id: "pro", plan_source: "manual" });
  });
});

describe("webhooks", () => {
  const signed = (payload: string, secret = SECRET) =>
    new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload, secret });

  function event(type: string, object: unknown): string {
    counter += 1;
    return JSON.stringify({ id: `evt_test_${counter}`, object: "event", type, data: { object } });
  }

  it("accepts a correctly signed event", async () => {
    const user = await makeUser();
    const payload = event("customer.subscription.updated", subscription(user));
    const parsed = parseWebhook(payload, signed(payload));
    expect(parsed.type).toBe("customer.subscription.updated");
    await handleWebhookEvent(parsed);
    expect(reload(user).plan_id).toBe("plus");
  });

  it("rejects a missing, forged or tampered signature", async () => {
    const user = await makeUser();
    const payload = event("customer.subscription.updated", subscription(user, { planId: "pro" }));
    const check = (signature: string | null, body = payload) => {
      try {
        parseWebhook(body, signature);
      } catch (error) {
        return error instanceof ApiError ? error.status : -1;
      }
      return 200;
    };
    expect(check(null)).toBe(400);
    expect(check("t=1,v1=deadbeef")).toBe(400);
    expect(check(signed(payload, "whsec_someone_else"))).toBe(400);
    expect(check(signed(payload), payload.replace('"plus"', '"pro"').replace("pro", "plus"))).toBe(400);
    expect(reload(user).plan_id).toBe("free");
  });

  it("processes a repeated delivery only once", async () => {
    const user = await makeUser();
    const payload = event("customer.subscription.updated", subscription(user));
    const parsed = parseWebhook(payload, signed(payload));
    await handleWebhookEvent(parsed);
    updateUser(user.id, { plan_id: "free", plan_source: "none" }); // pretend something changed since
    await handleWebhookEvent(parsed); // the provider retries the same event
    expect(reload(user).plan_id).toBe("free");
  });

  it("ignores events for accounts it does not know", async () => {
    const ghost = { id: "does-not-exist" } as UserRow;
    const payload = event("customer.subscription.deleted", subscription(ghost, { status: "canceled" }));
    await expect(handleWebhookEvent(parseWebhook(payload, signed(payload)))).resolves.toBeUndefined();
  });
});
