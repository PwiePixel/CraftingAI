import "server-only";
import { getDb } from "./db";
import { hashIp } from "./ids";

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip_hash: string | null;
  created_at: number;
}

export function audit(entry: {
  action: string;
  actor?: { id: string; email: string } | null;
  target?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
}): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (actor_id, actor_email, action, target, detail, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.actor?.id ?? null,
        entry.actor?.email ?? null,
        entry.action,
        entry.target ?? null,
        entry.detail ? JSON.stringify(entry.detail) : null,
        hashIp(entry.ip),
        Date.now(),
      );
  } catch (error) {
    console.error("[audit] failed to write entry:", error);
  }
}

export function listAudit(limit: number, offset: number): { rows: AuditEntry[]; total: number } {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as AuditEntry[];
  const total = (db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number }).n;
  return { rows, total };
}
