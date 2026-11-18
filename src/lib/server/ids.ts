import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "./env";

/** 128-bit, URL-safe random identifier. */
export function newId(): string {
  return randomBytes(16).toString("base64url");
}

/** 256-bit, URL-safe random secret (session tokens, temporary passwords). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * IP addresses are personal data. They are never stored in clear text; only a
 * keyed, truncated hash is kept so abuse can be correlated without revealing
 * the address itself.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", env.appSecret).update(ip).digest("hex").slice(0, 24);
}
