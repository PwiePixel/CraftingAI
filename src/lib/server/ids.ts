import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
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

/**
 * The network an address belongs to, for rate limiting. An IPv6 customer
 * usually controls a whole /64, so limits keyed on single IPv6 addresses
 * would be trivial to sidestep. IPv4 addresses are used as they are.
 */
export function networkPrefix(ip: string): string {
  let address = ip.trim().toLowerCase();
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return mapped[1]!;
  if (isIP(address) !== 6) return address;

  const [head = "", tail] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? headGroups
      : [
          ...headGroups,
          ...Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill("0"),
          ...tailGroups,
        ];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** Pseudonymous rate-limit key for a client address. */
export function ipRateKey(ip: string | null | undefined): string {
  return ip ? (hashIp(networkPrefix(ip)) ?? "unknown") : "unknown";
}
