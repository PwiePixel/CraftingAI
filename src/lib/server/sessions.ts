import "server-only";
import { getDb } from "./db";
import { env } from "./env";
import { hashIp, newToken, sha256 } from "./ids";
import type { UserRow } from "./users";

/** Sessions end after 30 days, or after 14 days without activity. */
const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const IDLE_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The `__Host-` prefix makes browsers enforce Secure, Path=/ and no Domain
 * attribute, so the cookie cannot be set or overwritten from a sub-domain.
 */
export function sessionCookieName(): string {
  return env.isHttps ? "__Host-crafting_session" : "crafting_session";
}

export interface SessionRow {
  id: string;
  user_id: string;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
}

export function createSession(
  userId: string,
  meta: { ip: string | null; userAgent: string | null },
): { token: string; expiresAt: number } {
  const db = getDb();
  const now = Date.now();
  // Opportunistic clean-up of expired sessions.
  db.prepare("DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?").run(
    now,
    now - IDLE_LIFETIME_MS,
  );
  const token = newToken();
  const expiresAt = now + ABSOLUTE_LIFETIME_MS;
  db.prepare(
    `INSERT INTO sessions (id, user_id, ip_hash, user_agent, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sha256(token), // only a hash of the token is stored
    userId,
    hashIp(meta.ip),
    meta.userAgent ? meta.userAgent.slice(0, 300) : null,
    now,
    now,
    expiresAt,
  );
  return { token, expiresAt };
}

export function findSession(token: string): { session: SessionRow; user: UserRow } | null {
  if (!token || token.length > 200) return null;
  const db = getDb();
  const id = sha256(token);
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;
  if (!session) return null;
  const now = Date.now();
  if (session.expires_at <= now || session.last_seen_at <= now - IDLE_LIFETIME_MS) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as
    | UserRow
    | undefined;
  if (!user || user.status !== "active") return null;
  if (now - session.last_seen_at > TOUCH_INTERVAL_MS) {
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, id);
  }
  return { session, user };
}

export function revokeSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
}

/** Removes all sessions of a user, optionally keeping the current one. */
export function revokeUserSessions(userId: string, exceptSessionId?: string): number {
  const db = getDb();
  const result = exceptSessionId
    ? db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(userId, exceptSessionId)
    : db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return result.changes;
}

export function countUserSessions(userId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?")
    .get(userId, Date.now()) as { n: number };
  return row.n;
}
