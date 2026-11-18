import { handleWebhookEvent, parseWebhook } from "@/lib/server/billing";
import { ApiError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_000_000;

/**
 * Receives subscription events from the payment provider. There is no session
 * and no same-origin check here: the request is authenticated by its signature.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) return new Response("Payload too large", { status: 413 });
    const payload = await request.text();
    if (payload.length > MAX_BYTES) return new Response("Payload too large", { status: 413 });

    const event = parseWebhook(payload, request.headers.get("stripe-signature"));
    await handleWebhookEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof ApiError) return new Response(error.message, { status: error.status });
    console.error("[billing] webhook failed:", error);
    // A 5xx answer makes the provider deliver the event again later.
    return new Response("Webhook handling failed", { status: 500 });
  }
}
