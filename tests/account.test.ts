import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, registerAccount, registerSchema } from "@/lib/server/account";
import { ApiError } from "@/lib/server/http";
import { resetRateLimits } from "@/lib/server/ratelimit";
import { updateSettings } from "@/lib/server/settings";
import { findUserByEmail, updateUser } from "@/lib/server/users";

const input = (email: string, password = "correct horse battery") =>
  registerSchema.parse({ email, password, name: "Test", acceptTerms: true, confirmAge: true });

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected an ApiError");
}

beforeEach(() => resetRateLimits());

describe("registration", () => {
  it("creates an account with a hashed password and recorded consent", async () => {
    const user = await registerAccount(input("New.User@Example.com"), "198.51.100.1");
    expect(user.email).toBe("new.user@example.com");
    expect(user.role).toBe("user");
    expect(user.password_hash.startsWith("$argon2id$")).toBe(true);
    expect(user.terms_accepted_at).toBeGreaterThan(0);
  });

  it("requires consent to the terms and an age confirmation", () => {
    expect(registerSchema.safeParse({ email: "a@example.com", password: "correct horse battery", acceptTerms: false, confirmAge: true }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@example.com", password: "correct horse battery", acceptTerms: true }).success).toBe(false);
  });

  it("rejects duplicates (case-insensitively) and weak passwords", async () => {
    await registerAccount(input("dup@example.com"), null);
    expect((await rejection(registerAccount(input("DUP@example.com"), null))).code).toBe("email_taken");
    expect((await rejection(registerAccount(input("weak@example.com", "password123"), null))).code).toBe("weak_password");
  });

  it("can be closed by the administrator", async () => {
    updateSettings({ registrationOpen: false });
    expect((await rejection(registerAccount(input("late@example.com"), null))).code).toBe("registration_closed");
    updateSettings({ registrationOpen: true });
  });

  it("is rate limited per address", async () => {
    for (let i = 0; i < 5; i += 1) await registerAccount(input(`burst${i}@example.com`), "198.51.100.77");
    expect((await rejection(registerAccount(input("burst5@example.com"), "198.51.100.77"))).status).toBe(429);
  });

  it("stops accepting new accounts once the site-wide daily ceiling is reached", async () => {
    updateSettings({ maxDailyRegistrations: 1 });
    // Earlier tests in this file already created accounts today.
    const error = await rejection(registerAccount(input("ceiling@example.com"), "198.51.100.200"));
    expect(error.code).toBe("registration_limit");
    expect(findUserByEmail("ceiling@example.com")).toBeUndefined();
    updateSettings({ maxDailyRegistrations: 0 });
    await registerAccount(input("ceiling@example.com"), "198.51.100.200");
    updateSettings({ maxDailyRegistrations: 100 });
  });

  it("silently refuses bots that fill the hidden field", async () => {
    const bot = { ...input("bot@example.com"), website: "https://spam.example" };
    await rejection(registerAccount(bot, null));
    expect(findUserByEmail("bot@example.com")).toBeUndefined();
  });
});

describe("sign-in", () => {
  it("accepts the right password and gives the same error for unknown users and wrong passwords", async () => {
    await registerAccount(input("login@example.com"), null);
    expect((await authenticate({ email: "login@example.com", password: "correct horse battery" }, null)).email).toBe("login@example.com");
    const wrong = await rejection(authenticate({ email: "login@example.com", password: "wrong password!!" }, null));
    const unknown = await rejection(authenticate({ email: "nobody@example.com", password: "wrong password!!" }, null));
    expect(wrong.code).toBe("invalid_credentials");
    expect(unknown.code).toBe(wrong.code);
    expect(unknown.message).toBe(wrong.message);
  });

  it("slows down guessing from one network without locking out the real owner", async () => {
    await registerAccount(input("target@example.com"), null);
    const attacker = "203.0.113.50";
    for (let i = 0; i < 8; i += 1) {
      await rejection(authenticate({ email: "target@example.com", password: "wrong password!!" }, attacker));
    }
    // The attacker's network is now blocked for this account, even with the right password.
    const blocked = await rejection(
      authenticate({ email: "target@example.com", password: "correct horse battery" }, attacker),
    );
    expect(blocked.status).toBe(429);
    // The owner, signing in from somewhere else, is not affected.
    const owner = await authenticate({ email: "target@example.com", password: "correct horse battery" }, "198.51.100.9");
    expect(owner.email).toBe("target@example.com");
  });

  it("treats a whole IPv6 /64 as one source", async () => {
    await registerAccount(input("v6@example.com"), null);
    for (let i = 0; i < 8; i += 1) {
      await rejection(authenticate({ email: "v6@example.com", password: "wrong password!!" }, `2001:db8:1:2::${i + 1}`));
    }
    const blocked = await rejection(
      authenticate({ email: "v6@example.com", password: "correct horse battery" }, "2001:db8:1:2:ffff::99"),
    );
    expect(blocked.status).toBe(429);
  });

  it("refuses suspended accounts", async () => {
    const user = await registerAccount(input("suspended@example.com"), null);
    updateUser(user.id, { status: "suspended" });
    expect((await rejection(authenticate({ email: "suspended@example.com", password: "correct horse battery" }, null))).code).toBe("account_suspended");
  });
});
