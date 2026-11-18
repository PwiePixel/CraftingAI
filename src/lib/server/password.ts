import "server-only";
import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters, above the OWASP minimum (19 MiB, t=2, p=1).
 * `algorithm: 2` selects Argon2id.
 */
const OPTIONS = { algorithm: 2, memoryCost: 32_768, timeCost: 3, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "1234567890",
  "12345678910",
  "0123456789",
  "0987654321",
  "1q2w3e4r5t",
  "1q2w3e4r5t6y",
  "qwertyuiop",
  "qwerty12345",
  "qwerty123456",
  "password12",
  "password123",
  "password1234",
  "passwordpassword",
  "iloveyou123",
  "letmein12345",
  "welcome12345",
  "administrator",
  "adminadmin",
  "admin12345",
  "changeme123",
  "abcdefghij",
  "abc1234567",
  "aaaaaaaaaa",
  "1111111111",
  "0000000000",
  "football123",
  "sunshine123",
  "princess123",
  "dragon12345",
  "monkey12345",
]);

/** Returns a human-readable problem, or `null` when the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`;
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || new Set(lower).size < 4) {
    return "This password is too easy to guess. Please choose a different one.";
  }
  if (email) {
    const emailLower = email.toLowerCase();
    const local = emailLower.split("@")[0] ?? "";
    if (lower === emailLower || (local.length >= 4 && lower === local)) {
      return "Your password must not be your email address.";
    }
  }
  return null;
}

/** Thrown when too many password operations are already waiting. */
export class TooBusyError extends Error {
  constructor() {
    super("Too many password operations in progress.");
    this.name = "TooBusyError";
  }
}

/**
 * Argon2 is deliberately expensive (32 MiB and a few dozen milliseconds per
 * call). Only a few calls run at once and the waiting line is short, so a
 * burst of sign-in attempts cannot exhaust the server's memory or CPU.
 */
const MAX_CONCURRENT = 3;
const MAX_WAITING = 40;
let running = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    if (waiting.length >= MAX_WAITING) throw new TooBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

export function hashPassword(password: string): Promise<string> {
  return withSlot(() => hash(password, OPTIONS));
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return withSlot(async () => {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  });
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real verification. Used when the account does not
 * exist so response timing does not reveal which emails are registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equalisation-placeholder");
  await verifyPassword(await dummyHash, password);
}
