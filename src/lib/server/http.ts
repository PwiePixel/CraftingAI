import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";
import type { ApiErrorBody } from "@/lib/shared/types";
import { env } from "./env";
import { TooBusyError } from "./password";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: ApiError): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      },
    },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}),
      },
    },
  );
}

/**
 * Client address as reported by the trusted reverse proxy. The proxy appends
 * the real peer address, so the right-most entry is the one to trust.
 */
let warnedAboutUnknownAddress = false;

export function clientIp(request: Request): string | null {
  if (!env.trustProxy) {
    if (env.isProd && !warnedAboutUnknownAddress) {
      warnedAboutUnknownAddress = true;
      console.warn(
        "[http] TRUST_PROXY is not set, so client addresses are unknown and per-address rate limits are shared by all visitors. Run the app behind a reverse proxy and set TRUST_PROXY=1.",
      );
    }
    return null;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const parts = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth (the session cookie is already SameSite=Lax):
 * state-changing requests must come from our own origin.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === env.appOrigin) return;
    if (!env.isProd) {
      // In development the site may be opened through another local hostname.
      const host = request.headers.get("host");
      try {
        if (host && new URL(origin).host === host) return;
      } catch {
        // fall through to the rejection below
      }
    }
    throw new ApiError(403, "forbidden_origin", "Cross-origin requests are not allowed.");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "forbidden_origin", "Cross-origin requests are not allowed.");
  }
}

async function readBodyLimited(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "payload_too_large", "The request is too large.");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, "payload_too_large", "The request is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Reads, size-limits and validates a JSON request body. */
export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes = 32_000,
): Promise<T> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Expected a JSON request body.");
  }
  const text = await readBodyLimited(request, maxBytes);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(400, "invalid_request", firstIssue(parsed.error));
  return parsed.data;
}

export function firstIssue(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The request is invalid.";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

type Handler<C> = (request: NextRequest, context: C) => Promise<Response> | Response;

/**
 * Wraps an API route: enforces the same-origin rule for state-changing
 * requests and converts thrown errors into JSON responses without leaking
 * internals.
 */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      if (!SAFE_METHODS.has(request.method)) assertSameOrigin(request);
      return await handler(request, context);
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof ApiError) return errorResponse(error);
      if (error instanceof TooBusyError) {
        return errorResponse(
          new ApiError(503, "busy", "The service is busy right now. Please try again in a moment.", 5),
        );
      }
      if (error instanceof ZodError) {
        return errorResponse(new ApiError(400, "invalid_request", firstIssue(error)));
      }
      console.error("[api] unhandled error:", error);
      return errorResponse(
        new ApiError(500, "internal_error", "Something went wrong. Please try again."),
      );
    }
  };
}

/** A JSON response. API data is never cached unless a caller says otherwise. */
export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return NextResponse.json(data, { ...init, headers });
}
