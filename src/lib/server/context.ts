import type { MessageRole } from "@/lib/shared/types";

export interface ContextMessage {
  seq: number;
  role: MessageRole;
  content: string;
}

/**
 * Chooses which part of a conversation is sent upstream.
 *
 * To keep cost bounded, only a window of `budgetChars` characters is sent.
 * When the window overflows it is cut back to half the budget in one step and
 * the new starting point is remembered. Moving the start rarely (instead of a
 * little on every request) keeps the prompt prefix stable, which is what makes
 * prompt caching effective.
 */
export function selectContext<T extends ContextMessage>(
  rows: readonly T[],
  startSeq: number,
  budgetChars: number,
): { messages: T[]; startSeq: number } {
  // Empty messages (failed or declined replies) carry no information.
  let usable = rows.filter((row) => row.seq >= startSeq && row.content.trim() !== "");
  const total = usable.reduce((sum, row) => sum + row.content.length, 0);

  if (total > budgetChars && usable.length > 1) {
    const target = Math.floor(budgetChars / 2);
    let remaining = total;
    let index = 0;
    while (index < usable.length - 1 && remaining > target) {
      remaining -= usable[index]!.content.length;
      index += 1;
    }
    usable = usable.slice(index);
  }

  // A conversation sent upstream has to open with a user turn.
  let first = 0;
  while (first < usable.length - 1 && usable[first]!.role !== "user") first += 1;
  usable = usable.slice(first);

  return { messages: usable, startSeq: usable[0]?.seq ?? startSeq };
}
