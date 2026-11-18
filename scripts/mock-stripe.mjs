#!/usr/bin/env node
/**
 * Local stand-in for the Stripe API, for development and automated tests.
 * It implements just the calls the application makes and signs its webhooks
 * the same way the real service does, so the whole purchase flow can be tried
 * without an account and without money:
 *
 *   node scripts/mock-stripe.mjs          # listens on 127.0.0.1:4020
 *   STRIPE_API_BASE=http://127.0.0.1:4020 STRIPE_SECRET_KEY=sk_test_mock0000000000000000 \
 *   STRIPE_WEBHOOK_SECRET=whsec_mock0000000000000000 npm run dev
 *
 * The "checkout page" it returns has a single button that completes the payment.
 */
import crypto from "node:crypto";
import http from "node:http";

const port = Number(process.env.MOCK_STRIPE_PORT ?? 4020);
const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_mock0000000000000000";
const MONTH = 30 * 24 * 60 * 60;

const sessions = new Map();
const subscriptions = new Map();
let counter = 0;
const id = (prefix) => `${prefix}_mock${Date.now().toString(36)}${(counter += 1)}`;
const now = () => Math.floor(Date.now() / 1000);

/** Turns "a[b][0][c]=1" style form fields into nested objects. */
function parseForm(body) {
  const result = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const path = key.replace(/\]/g, "").split("[");
    let node = result;
    path.forEach((part, index) => {
      if (index === path.length - 1) node[part] = value;
      else node = node[part] ??= {};
    });
  }
  return result;
}

async function sendWebhook(type, object) {
  const payload = JSON.stringify({
    id: id("evt"),
    object: "event",
    api_version: "2026-10-28.endive",
    created: now(),
    type,
    data: { object },
  });
  const timestamp = now();
  const signature = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  const response = await fetch(`${appUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: payload,
  });
  console.log(`[mock-stripe] webhook ${type} -> ${response.status}`);
}

function subscriptionObject(subscription) {
  return {
    id: subscription.id,
    object: "subscription",
    customer: subscription.customer,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    metadata: subscription.metadata,
    created: subscription.created,
    items: {
      object: "list",
      data: [
        {
          id: subscription.item,
          object: "subscription_item",
          current_period_start: subscription.created,
          current_period_end: subscription.created + MONTH,
        },
      ],
    },
  };
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const form = parseForm(raw);
  console.log(`[mock-stripe] ${req.method} ${url.pathname}`);

  // --- API calls made by the application
  if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const session = {
      id: id("cs"),
      mode: form.mode,
      client_reference_id: form.client_reference_id ?? null,
      customer: form.customer ?? id("cus"),
      metadata: form.metadata ?? {},
      subscription_metadata: form.subscription_data?.metadata ?? {},
      amount: form.line_items?.["0"]?.price_data?.unit_amount,
      currency: form.line_items?.["0"]?.price_data?.currency,
      product: form.line_items?.["0"]?.price_data?.product_data?.name,
      success_url: form.success_url,
      cancel_url: form.cancel_url,
    };
    sessions.set(session.id, session);
    return send(res, 200, { id: session.id, object: "checkout.session", url: `http://127.0.0.1:${port}/pay/${session.id}` });
  }
  if (req.method === "POST" && url.pathname === "/v1/billing_portal/sessions") {
    return send(res, 200, { id: id("bps"), object: "billing_portal.session", url: form.return_url });
  }
  const subscriptionMatch = /^\/v1\/subscriptions\/([^/]+)$/.exec(url.pathname);
  if (subscriptionMatch) {
    const subscription = subscriptions.get(subscriptionMatch[1]);
    if (!subscription) {
      return send(res, 404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such subscription" } });
    }
    if (req.method === "POST" && form.cancel_at_period_end !== undefined) {
      subscription.cancel_at_period_end = form.cancel_at_period_end === "true";
      setTimeout(() => sendWebhook("customer.subscription.updated", subscriptionObject(subscription)), 50);
    }
    if (req.method === "DELETE") {
      subscription.status = "canceled";
      setTimeout(() => sendWebhook("customer.subscription.deleted", subscriptionObject(subscription)), 50);
    }
    return send(res, 200, subscriptionObject(subscription));
  }

  // --- the stand-in for the hosted checkout page
  const pay = /^\/pay\/([^/]+)(\/complete|\/expire-subscription)?$/.exec(url.pathname);
  if (pay && sessions.has(pay[1])) {
    const session = sessions.get(pay[1]);
    if (req.method === "GET") {
      return send(
        res,
        200,
        `<!doctype html><title>Mock checkout</title><body style="font-family:system-ui;max-width:28rem;margin:4rem auto">
         <h1>Mock checkout</h1><p>${session.product}: <b>${(Number(session.amount) / 100).toFixed(2)} ${String(session.currency).toUpperCase()}</b> per month</p>
         <form method="post" action="/pay/${session.id}/complete"><button id="pay">Pay</button></form>
         <p><a id="back" href="${session.cancel_url}">Cancel</a></p></body>`,
        "text/html",
      );
    }
    if (req.method === "POST" && pay[2] === "/complete") {
      const subscription = {
        id: id("sub"),
        item: id("si"),
        customer: session.customer,
        status: "active",
        cancel_at_period_end: false,
        metadata: session.subscription_metadata,
        created: now(),
      };
      subscriptions.set(subscription.id, subscription);
      await sendWebhook("customer.subscription.created", subscriptionObject(subscription));
      await sendWebhook("checkout.session.completed", {
        id: session.id,
        object: "checkout.session",
        mode: "subscription",
        client_reference_id: session.client_reference_id,
        customer: session.customer,
        subscription: subscription.id,
        metadata: session.metadata,
      });
      res.writeHead(303, { location: session.success_url });
      return res.end();
    }
  }

  // --- test helper: list what the mock knows
  if (req.method === "GET" && url.pathname === "/__state") {
    return send(res, 200, { sessions: [...sessions.values()], subscriptions: [...subscriptions.values()] });
  }
  send(res, 404, { error: { type: "invalid_request_error", message: `Unhandled ${req.method} ${url.pathname}` } });
});

server.listen(port, "127.0.0.1", () => console.log(`[mock-stripe] listening on http://127.0.0.1:${port}`));
