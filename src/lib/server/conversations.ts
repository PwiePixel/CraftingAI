import "server-only";
import { getDb } from "./db";
import { newId } from "./ids";
import type {
  ChatMessage,
  ConversationSummary,
  MessageRole,
  MessageStatus,
  TierId,
} from "@/lib/shared/types";

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  tier: TierId;
  context_start_seq: number;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  role: MessageRole;
  content: string;
  tier: TierId | null;
  status: MessageStatus;
  created_at: number;
}

export const TITLE_MAX_LENGTH = 80;

export function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    tier: row.tier,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    tier: row.tier,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** A provisional title derived from the first message. */
export function titleFromMessage(message: string): string {
  const singleLine = message.replace(/\s+/g, " ").trim();
  if (!singleLine) return "New chat";
  return singleLine.length > 48 ? `${singleLine.slice(0, 47).trimEnd()}…` : singleLine;
}

export function cleanTitle(title: string): string {
  return title
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TITLE_MAX_LENGTH);
}

export function listConversations(userId: string, limit = 300): ConversationSummary[] {
  const rows = getDb()
    .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?")
    .all(userId, limit) as ConversationRow[];
  return rows.map(toSummary);
}

/** Always scoped to the owner: another user's conversation is simply "not found". */
export function getConversation(userId: string, id: string): ConversationRow | undefined {
  return getDb()
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(id, userId) as ConversationRow | undefined;
}

export function createConversation(userId: string, title: string, tier: TierId): ConversationRow {
  const now = Date.now();
  const id = newId();
  getDb()
    .prepare(
      "INSERT INTO conversations (id, user_id, title, tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, userId, cleanTitle(title) || "New chat", tier, now, now);
  return getConversation(userId, id)!;
}

export function renameConversation(userId: string, id: string, title: string): boolean {
  const result = getDb()
    .prepare("UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?")
    .run(cleanTitle(title) || "New chat", id, userId);
  return result.changes > 0;
}

export function touchConversation(id: string, tier: TierId): void {
  getDb()
    .prepare("UPDATE conversations SET updated_at = ?, tier = ? WHERE id = ?")
    .run(Date.now(), tier, id);
}

export function setContextStart(id: string, seq: number): void {
  getDb().prepare("UPDATE conversations SET context_start_seq = ? WHERE id = ?").run(seq, id);
}

export function deleteConversation(userId: string, id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

export function deleteAllConversations(userId: string): number {
  return getDb().prepare("DELETE FROM conversations WHERE user_id = ?").run(userId).changes;
}

/** All messages from `fromSeq` on, oldest first. */
export function listMessageRows(conversationId: string, fromSeq = 0): MessageRow[] {
  return getDb()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? AND seq >= ? ORDER BY seq ASC")
    .all(conversationId, fromSeq) as MessageRow[];
}

/** Number of messages shown at once; older ones are loaded on request. */
export const MESSAGE_PAGE_SIZE = 60;

/**
 * The newest `limit` messages (older than `beforeSeq`, if given), oldest
 * first. Long conversations are never loaded into memory as a whole.
 */
export function listMessagePage(
  conversationId: string,
  limit = MESSAGE_PAGE_SIZE,
  beforeSeq?: number,
): { rows: MessageRow[]; hasMore: boolean } {
  const rows = getDb()
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
    )
    .all(conversationId, beforeSeq ?? Number.MAX_SAFE_INTEGER, limit + 1) as MessageRow[];
  const hasMore = rows.length > limit;
  return { rows: rows.slice(0, limit).reverse(), hasMore };
}

export function findMessageSeq(conversationId: string, messageId: string): number | undefined {
  const row = getDb()
    .prepare("SELECT seq FROM messages WHERE id = ? AND conversation_id = ?")
    .get(messageId, conversationId) as { seq: number } | undefined;
  return row?.seq;
}

export function listConversationIds(userId: string): string[] {
  const rows = getDb()
    .prepare("SELECT id FROM conversations WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId) as { id: string }[];
  return rows.map((row) => row.id);
}

export function appendMessage(
  conversationId: string,
  input: { role: MessageRole; content: string; tier: TierId | null; status?: MessageStatus },
): MessageRow {
  const db = getDb();
  const id = newId();
  const insert = db.transaction(() => {
    const next = db
      .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE conversation_id = ?")
      .get(conversationId) as { seq: number };
    db.prepare(
      `INSERT INTO messages (id, conversation_id, seq, role, content, tier, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      conversationId,
      next.seq,
      input.role,
      input.content,
      input.tier,
      input.status ?? "complete",
      Date.now(),
    );
  });
  insert();
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
}

/**
 * Removes the assistant replies that follow the last user message so the
 * answer can be generated again. Returns false if there is no user message.
 */
export function dropTrailingAssistantMessages(conversationId: string): boolean {
  const db = getDb();
  const lastUser = db
    .prepare(
      "SELECT MAX(seq) AS seq FROM messages WHERE conversation_id = ? AND role = 'user'",
    )
    .get(conversationId) as { seq: number | null };
  if (lastUser.seq === null) return false;
  db.prepare("DELETE FROM messages WHERE conversation_id = ? AND seq > ?").run(
    conversationId,
    lastUser.seq,
  );
  return true;
}
