import "server-only";
import { getDb } from "./db";
import { newId } from "./ids";
import type { Role, SessionUser, UserStatus } from "@/lib/shared/types";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  limit_multiplier: number;
  terms_version: string | null;
  terms_accepted_at: number | null;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toSessionUser(row: UserRow): SessionUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) as
    | UserRow
    | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role?: Role;
  termsVersion?: string | null;
}): UserRow {
  const now = Date.now();
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, role, terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      normalizeEmail(input.email),
      input.name.trim(),
      input.passwordHash,
      input.role ?? "user",
      input.termsVersion ?? null,
      input.termsVersion ? now : null,
      now,
      now,
    );
  return findUserById(id)!;
}

export function updateUser(
  id: string,
  patch: Partial<Pick<UserRow, "name" | "role" | "status" | "limit_multiplier" | "password_hash">>,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = ?");
  values.push(Date.now(), id);
  getDb()
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function markLogin(id: string): void {
  getDb().prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(Date.now(), id);
}

export function deleteUser(id: string): void {
  getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function countAdmins(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'")
    .get() as { n: number };
  return row.n;
}
