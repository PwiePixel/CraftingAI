import type { ApiErrorBody } from "@/lib/shared/types";
import { reloadTo } from "./navigate";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function toApiError(response: Response): Promise<ApiClientError> {
  let code = "request_failed";
  let message = "Something went wrong. Please try again.";
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error?.message) message = body.error.message;
    if (body.error?.code) code = body.error.code;
  } catch {
    // Non-JSON error (for example from the reverse proxy): keep the generic text.
  }
  return new ApiClientError(response.status, code, message);
}

/** JSON request helper for the app's own API. */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError(0, "network_error", "Network error. Check your connection and try again.");
  }
  if (!response.ok) {
    const error = await toApiError(response);
    if (error.status === 401 && !path.startsWith("/api/auth/")) {
      // The session ended: send the visitor back to the sign-in page.
      reloadTo("/login");
    }
    throw error;
  }
  return (await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
