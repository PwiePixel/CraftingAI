import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/server/db";
import { sha256 } from "@/lib/server/ids";
import {
  createSession,
  findSession,
  revokeSession,
  revokeUserSessions,
} from "@/lib/server/sessions";
import { updateUser } from "@/lib/server/users";
import { makeUser } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("sessions", () => {
  it("stores only a hash of the token and never the raw address", async () => {
    const user = await makeUser();
    const { token } = createSession(user.id, { ip: "203.0.113.7", userAgent: "test" });
    const rows = getDb().prepare("SELECT * FROM sessions WHERE user_id = ?").all(user.id) as {
      id: string;
      ip_hash: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(sha256(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.7");
  });

  it("resolves a valid token and rejects unknown ones", async () => {
    const user = await makeUser();
    const { token } = createSession(user.id, { ip: null, userAgent: null });
    expect(findSession(token)?.user.id).toBe(user.id);
    expect(findSession("not-a-real-token")).toBeNull();
    expect(findSession("")).toBeNull();
  });

  it("ends when revoked", async () => {
    const user = await makeUser();
    const { token } = createSession(user.id, { ip: null, userAgent: null });
    revokeSession(token);
    expect(findSession(token)).toBeNull();
  });

  it("can sign out every other device", async () => {
    const user = await makeUser();
    const current = createSession(user.id, { ip: null, userAgent: null });
    const other = createSession(user.id, { ip: null, userAgent: null });
    expect(revokeUserSessions(user.id, sha256(current.token))).toBe(1);
    expect(findSession(current.token)).not.toBeNull();
    expect(findSession(other.token)).toBeNull();
  });

  it("expires after the idle and absolute lifetimes", async () => {
    vi.useFakeTimers({ now: Date.now() });
    const user = await makeUser();
    const { token } = createSession(user.id, { ip: null, userAgent: null });
    vi.advanceTimersByTime(15 * 24 * 60 * 60 * 1000);
    expect(findSession(token)).toBeNull();
  });

  it("stops working when the account is suspended", async () => {
    const user = await makeUser();
    const { token } = createSession(user.id, { ip: null, userAgent: null });
    updateUser(user.id, { status: "suspended" });
    expect(findSession(token)).toBeNull();
  });
});
