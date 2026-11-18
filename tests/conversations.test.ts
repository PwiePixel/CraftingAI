import { describe, expect, it } from "vitest";
import {
  appendMessage,
  createConversation,
  deleteAllConversations,
  deleteConversation,
  dropTrailingAssistantMessages,
  getConversation,
  findMessageSeq,
  listConversations,
  listMessagePage,
  listMessageRows,
  renameConversation,
  titleFromMessage,
} from "@/lib/server/conversations";
import { getDb } from "@/lib/server/db";
import { deleteUser } from "@/lib/server/users";
import { makeUser } from "./helpers";

describe("conversations", () => {
  it("are only visible to their owner", async () => {
    const alice = await makeUser();
    const mallory = await makeUser();
    const conversation = createConversation(alice.id, "Private notes", "lite");

    expect(getConversation(alice.id, conversation.id)?.title).toBe("Private notes");
    expect(getConversation(mallory.id, conversation.id)).toBeUndefined();
    expect(renameConversation(mallory.id, conversation.id, "Hijacked")).toBe(false);
    expect(deleteConversation(mallory.id, conversation.id)).toBe(false);
    expect(listConversations(mallory.id)).toHaveLength(0);
    expect(getConversation(alice.id, conversation.id)?.title).toBe("Private notes");
  });

  it("numbers messages in order and can drop the last reply for regeneration", async () => {
    const user = await makeUser();
    const conversation = createConversation(user.id, "Chat", "lite");
    appendMessage(conversation.id, { role: "user", content: "one", tier: "lite" });
    appendMessage(conversation.id, { role: "assistant", content: "two", tier: "lite" });
    appendMessage(conversation.id, { role: "user", content: "three", tier: "lite" });
    appendMessage(conversation.id, { role: "assistant", content: "four", tier: "lite", status: "stopped" });

    expect(listMessageRows(conversation.id).map((row) => row.seq)).toEqual([1, 2, 3, 4]);
    expect(dropTrailingAssistantMessages(conversation.id)).toBe(true);
    expect(listMessageRows(conversation.id).map((row) => row.content)).toEqual(["one", "two", "three"]);
    // Nothing more to drop, but there is still a user message to answer.
    expect(dropTrailingAssistantMessages(conversation.id)).toBe(true);
    expect(listMessageRows(conversation.id)).toHaveLength(3);
  });

  it("refuses to regenerate when there is no user message", async () => {
    const user = await makeUser();
    const conversation = createConversation(user.id, "Empty", "lite");
    expect(dropTrailingAssistantMessages(conversation.id)).toBe(false);
  });

  it("deletes messages together with the conversation and the account", async () => {
    const user = await makeUser();
    const first = createConversation(user.id, "One", "lite");
    const second = createConversation(user.id, "Two", "pro");
    appendMessage(first.id, { role: "user", content: "hello", tier: "lite" });
    appendMessage(second.id, { role: "user", content: "hello", tier: "pro" });
    const count = () =>
      (getDb().prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id IN (?, ?)").get(first.id, second.id) as { n: number }).n;

    expect(count()).toBe(2);
    deleteConversation(user.id, first.id);
    expect(count()).toBe(1);
    deleteUser(user.id);
    expect(count()).toBe(0);
    expect(deleteAllConversations(user.id)).toBe(0);
  });

  it("pages through long conversations from the newest message backwards", async () => {
    const user = await makeUser();
    const conversation = createConversation(user.id, "Long", "lite");
    const ids: string[] = [];
    for (let i = 1; i <= 7; i += 1) {
      ids.push(appendMessage(conversation.id, { role: i % 2 ? "user" : "assistant", content: `m${i}`, tier: "lite" }).id);
    }
    const newest = listMessagePage(conversation.id, 3);
    expect(newest.rows.map((row) => row.content)).toEqual(["m5", "m6", "m7"]);
    expect(newest.hasMore).toBe(true);

    const beforeSeq = findMessageSeq(conversation.id, newest.rows[0]!.id);
    const middle = listMessagePage(conversation.id, 3, beforeSeq);
    expect(middle.rows.map((row) => row.content)).toEqual(["m2", "m3", "m4"]);
    expect(middle.hasMore).toBe(true);

    const oldest = listMessagePage(conversation.id, 3, findMessageSeq(conversation.id, middle.rows[0]!.id));
    expect(oldest.rows.map((row) => row.content)).toEqual(["m1"]);
    expect(oldest.hasMore).toBe(false);

    // A message id from another conversation is not accepted as a cursor.
    const other = createConversation(user.id, "Other", "lite");
    expect(findMessageSeq(other.id, ids[0]!)).toBeUndefined();
    // Reading from a starting point only returns what is needed for the reply.
    expect(listMessageRows(conversation.id, 6).map((row) => row.content)).toEqual(["m6", "m7"]);
  });

  it("derives a short provisional title from the first message", () => {
    expect(titleFromMessage("  Hello\n\nworld  ")).toBe("Hello world");
    expect(titleFromMessage("x".repeat(200)).length).toBeLessThanOrEqual(48);
    expect(titleFromMessage("   ")).toBe("New chat");
  });
});
