import "server-only";
import Stripe from "stripe";
import { audit } from "./audit";
import { getDb } from "./db";
import { env } from "./env";
import { ApiError } from "./http";
import { getSettings } from "./settings";
import {
  findUserById,
  findUserByStripeCustomer,
  findUserByStripeSubscription,
  updateUser,
  type UserRow,
} from "./users";
import type { Plan } from "@/lib/shared/billing-schema";

/** Subscription states that give access to the plan. */
const ACTIVE_STATES = new Set(["active", "trialing", "past_due"]);

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

const store = globalThis as unknown as { __lishiaStripe?: Stripe };

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ApiError(503, "billing_unavailable", "Payments are not available yet. Please try again later.");
  }
  if (!store.__lishiaStripe) {
    // STRIPE_API_BASE points the client at a local stand-in during development and tests.
    const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
    store.__lishiaStripe = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      ...(base
        ? {
            host: base.hostname,
            port: base.port || (base.protocol === "https:" ? 443 : 80),
            protocol: base.protocol === "https:" ? ("https" as const) : ("http" as const),
          }
        : {}),
    });
  }
  return store.__lishiaStripe;
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Starts a checkout for a plan. The price comes from the plan as configured in
 * the admin dashboard and is handed to the payment provider with the request,
 * so there is no second price list to keep in sync.
 */
export async function createCheckout(user: UserRow, plan: Plan): Promise<string> {
  const settings = getSettings();
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    client_reference_id: user.id,
    ...(user.stripe_customer_id
      ? { customer: user.stripe_customer_id }
      : { customer_email: user.email }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: settings.billing.currency,
          unit_amount: plan.priceCents,
          recurring: { interval: "month" },
          product_data: { name: `${settings.siteName} ${plan.name}` },
        },
      },
    ],
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: { metadata: { userId: user.id, planId: plan.id } },
    success_url: `${env.appUrl}/settings/plan?checkout=success`,
    cancel_url: `${env.appUrl}/settings/plan?checkout=cancelled`,
  });
  if (!session.url) throw new ApiError(502, "billing_error", "The checkout could not be started.");
  return session.url;
}

/** Opens the provider's self-service page for invoices and payment methods. */
export async function createPortal(user: UserRow): Promise<string> {
  if (!user.stripe_customer_id) {
    throw new ApiError(400, "no_subscription", "There is no billing account for this user yet.");
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${env.appUrl}/settings/plan`,
  });
  return session.url;
}

/** Schedules the subscription to end with the paid period, or takes that back. */
export async function setCancelAtPeriodEnd(user: UserRow, cancel: boolean): Promise<void> {
  if (!user.stripe_subscription_id || user.plan_source !== "stripe") {
    throw new ApiError(400, "no_subscription", "You do not have an active subscription.");
  }
  const subscription = await stripe().subscriptions.update(user.stripe_subscription_id, {
    cancel_at_period_end: cancel,
  });
  applySubscription(subscription);
}

/**
 * Ends a subscription immediately. Called before an account is deleted, so
 * nobody keeps being charged for an account that no longer exists.
 */
export async function endSubscriptionNow(user: UserRow): Promise<void> {
  if (user.plan_source !== "stripe" || !user.stripe_subscription_id) return;
  if (!billingConfigured()) {
    throw new ApiError(
      503,
      "billing_unavailable",
      "The subscription of this account could not be cancelled right now. Please try again later.",
    );
  }
  try {
    await stripe().subscriptions.cancel(user.stripe_subscription_id);
  } catch (error) {
    // Already gone at the provider: nothing left to cancel.
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 404) return;
    console.error("[billing] could not cancel subscription before deleting the account:", error);
    throw new ApiError(
      502,
      "billing_error",
      "The subscription of this account could not be cancelled right now. Please try again later.",
    );
  }
}

function periodEnd(subscription: Stripe.Subscription): number | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  return ends.length > 0 ? Math.max(...ends) * 1000 : null;
}

function resolveUser(subscription: Stripe.Subscription): UserRow | undefined {
  const fromMetadata = subscription.metadata?.userId;
  return (
    (fromMetadata ? findUserById(fromMetadata) : undefined) ??
    findUserByStripeSubscription(subscription.id) ??
    (idOf(subscription.customer) ? findUserByStripeCustomer(idOf(subscription.customer)!) : undefined)
  );
}

/**
 * Brings a user's plan in line with a subscription object from the provider.
 * `adopt` forces the subscription to become the user's current one (used
 * after a completed checkout).
 */
export function applySubscription(subscription: Stripe.Subscription, adopt = false): void {
  const user = resolveUser(subscription);
  if (!user) return;

  const isCurrent = user.stripe_subscription_id === subscription.id;
  const active = ACTIVE_STATES.has(subscription.status);

  if (active) {
    // A different subscription only replaces the current one when there is
    // none in good standing, or when a checkout was just completed for it.
    const currentInGoodStanding =
      user.plan_source === "stripe" && ACTIVE_STATES.has(user.plan_status ?? "");
    if (!isCurrent && !adopt && currentInGoodStanding) return;

    const planId = subscription.metadata?.planId;
    if (!planId) return;
    updateUser(user.id, {
      plan_id: planId,
      plan_source: "stripe",
      plan_status: subscription.status,
      plan_period_end: periodEnd(subscription),
      plan_cancel_at_period_end: subscription.cancel_at_period_end ? 1 : 0,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: idOf(subscription.customer) ?? user.stripe_customer_id,
    });
    return;
  }

  // "incomplete" means the first payment has not gone through yet: nothing to do.
  if (subscription.status === "incomplete") return;

  // Ended, unpaid or paused: back to the free plan, but only for the subscription in use.
  if (isCurrent) {
    updateUser(user.id, {
      plan_id: "free",
      plan_source: "none",
      plan_status: subscription.status,
      plan_period_end: null,
      plan_cancel_at_period_end: 0,
      stripe_subscription_id: null,
    });
    audit({ action: "billing.subscription_ended", target: user.id, detail: { status: subscription.status } });
  }
}

/** Verifies that a webhook really comes from the payment provider. */
export function parseWebhook(payload: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    throw new ApiError(503, "billing_unavailable", "Webhooks are not configured.");
  }
  if (!signature) throw new ApiError(400, "invalid_signature", "Missing signature.");
  try {
    return stripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new ApiError(400, "invalid_signature", "The signature could not be verified.");
  }
}

/** Returns false when this delivery was processed before. */
function claimEvent(id: string): boolean {
  const result = getDb()
    .prepare("INSERT OR IGNORE INTO payment_events (id, received_at) VALUES (?, ?)")
    .run(id, Date.now());
  return result.changes > 0;
}

function releaseEvent(id: string): void {
  getDb().prepare("DELETE FROM payment_events WHERE id = ?").run(id);
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  if (!claimEvent(event.id)) return;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId = idOf(session.subscription);
        if (session.mode !== "subscription" || !subscriptionId) break;
        const user = session.client_reference_id ? findUserById(session.client_reference_id) : undefined;
        if (!user) break;

        const previous = user.plan_source === "stripe" ? user.stripe_subscription_id : null;
        const customerId = idOf(session.customer);
        if (customerId) updateUser(user.id, { stripe_customer_id: customerId });

        const subscription = await stripe().subscriptions.retrieve(subscriptionId);
        applySubscription(subscription, true);
        audit({
          action: "billing.subscribed",
          actor: user,
          target: user.id,
          detail: { plan: subscription.metadata?.planId ?? null },
        });

        // Switching plans: the earlier subscription ends now and unused time is credited.
        if (previous && previous !== subscriptionId) {
          try {
            await stripe().subscriptions.cancel(previous, { prorate: true });
          } catch (error) {
            console.error("[billing] could not cancel the previous subscription:", error);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        applySubscription(event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    // Let the provider deliver the event again.
    releaseEvent(event.id);
    throw error;
  }
}
