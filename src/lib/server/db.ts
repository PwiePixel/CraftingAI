import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "./env";

type Migration = { id: number; name: string; sql: string };

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
        limit_multiplier REAL NOT NULL DEFAULT 1,
        terms_version TEXT,
        terms_accepted_at INTEGER,
        last_login_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ip_hash TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX sessions_user ON sessions(user_id);
      CREATE INDEX sessions_expiry ON sessions(expires_at);

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        tier TEXT NOT NULL,
        context_start_seq INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX conversations_user ON conversations(user_id, updated_at DESC);

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        tier TEXT,
        status TEXT NOT NULL DEFAULT 'complete'
          CHECK (status IN ('complete', 'stopped', 'truncated', 'refused', 'error')),
        created_at INTEGER NOT NULL,
        UNIQUE (conversation_id, seq)
      );

      CREATE TABLE usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        kind TEXT NOT NULL CHECK (kind IN ('chat', 'title')),
        tier TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        cost_micro_usd INTEGER NOT NULL DEFAULT 0,
        day TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX usage_user_day ON usage_events(user_id, day, tier, kind);
      CREATE INDEX usage_day ON usage_events(day);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT,
        actor_email TEXT,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        ip_hash TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX audit_created ON audit_log(created_at DESC);
    `,
  },
];

function migrate(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((r) => r.id),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        migration.id,
        migration.name,
        Date.now(),
      );
    })();
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Retention periods, as described in the Privacy Policy. */
const AUDIT_RETENTION_DAYS = 180;
const USAGE_RETENTION_DAYS = 400;

function prune(db: Database.Database): void {
  try {
    const now = Date.now();
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
    db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(now - AUDIT_RETENTION_DAYS * DAY_MS);
    db.prepare("DELETE FROM usage_events WHERE created_at < ?").run(
      now - USAGE_RETENTION_DAYS * DAY_MS,
    );
  } catch (error) {
    console.error("[db] retention clean-up failed:", error);
  }
}

function open(): Database.Database {
  const file = process.env.DATABASE_FILE ?? path.join(env.dataDir, "craftingai.db");
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  prune(db);
  setInterval(() => prune(db), 12 * 60 * 60 * 1000).unref();
  if (file !== ":memory:") {
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // Not fatal: the data directory itself is already private.
    }
  }
  return db;
}

// Reuse one connection across hot reloads in development.
const globalStore = globalThis as unknown as { __craftingDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalStore.__craftingDb) globalStore.__craftingDb = open();
  return globalStore.__craftingDb;
}

/** Test helper: drop the cached connection so the next call opens a fresh one. */
export function resetDbForTests(): void {
  globalStore.__craftingDb?.close();
  globalStore.__craftingDb = undefined;
}
