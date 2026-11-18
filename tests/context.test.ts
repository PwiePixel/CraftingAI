import { describe, expect, it } from "vitest";
import { selectContext, type ContextMessage } from "@/lib/server/context";

function conversation(sizes: number[]): ContextMessage[] {
  return sizes.map((size, index) => ({
    seq: index + 1,
    role: index % 2 === 0 ? "user" : "assistant",
    content: "x".repeat(size),
  }));
}

describe("selectContext", () => {
  it("sends everything while the conversation fits the budget", () => {
    const rows = conversation([10, 10, 10]);
    const result = selectContext(rows, 0, 100);
    expect(result.messages).toHaveLength(3);
    expect(result.startSeq).toBe(1);
  });

  it("cuts back to about half the budget in one step when it overflows", () => {
    const rows = conversation([40, 40, 40, 40, 40]); // 200 characters
    const result = selectContext(rows, 0, 150);
    const total = result.messages.reduce((sum, row) => sum + row.content.length, 0);
    expect(total).toBeLessThanOrEqual(75 + 40);
    expect(result.messages[0]!.role).toBe("user");
    expect(result.messages.at(-1)!.seq).toBe(5);
    expect(result.startSeq).toBeGreaterThan(1);
  });

  it("keeps the starting point stable on the following request", () => {
    const rows = conversation([40, 40, 40, 40, 40]);
    const first = selectContext(rows, 0, 150);
    const next = selectContext([...rows, { seq: 6, role: "assistant", content: "y".repeat(10) }], first.startSeq, 150);
    expect(next.startSeq).toBe(first.startSeq);
  });

  it("always keeps the newest message, even if it alone exceeds the budget", () => {
    const rows = conversation([10, 10, 500]);
    const result = selectContext(rows, 0, 100);
    expect(result.messages.map((row) => row.seq)).toEqual([3]);
  });

  it("skips empty replies and never starts with an assistant turn", () => {
    const rows: ContextMessage[] = [
      { seq: 1, role: "assistant", content: "orphan" },
      { seq: 2, role: "user", content: "question" },
      { seq: 3, role: "assistant", content: "   " },
      { seq: 4, role: "user", content: "again" },
    ];
    const result = selectContext(rows, 0, 1000);
    expect(result.messages.map((row) => row.seq)).toEqual([2, 4]);
  });
});
