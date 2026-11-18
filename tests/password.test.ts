import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/server/password";

describe("passwords", () => {
  it("rejects short, common and trivially repetitive passwords", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("password123")).toMatch(/easy to guess/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/easy to guess/);
    expect(passwordProblem("x".repeat(129))).toMatch(/at most/);
  });

  it("rejects the email address as password", () => {
    expect(passwordProblem("alice.wonder@example.com", "alice.wonder@example.com")).toMatch(/email/);
    expect(passwordProblem("alice.wonder", "alice.wonder@example.com")).toMatch(/email/);
  });

  it("accepts a reasonable passphrase", () => {
    expect(passwordProblem("correct horse battery", "alice@example.com")).toBeNull();
  });

  it("hashes with Argon2id and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong password!")).toBe(false);
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
});
