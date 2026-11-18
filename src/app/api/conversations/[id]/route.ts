import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import {
  deleteConversation,
  findMessageSeq,
  getConversation,
  listMessagePage,
  MESSAGE_PAGE_SIZE,
  renameConversation,
  toChatMessage,
  toSummary,
  TITLE_MAX_LENGTH,
} from "@/lib/server/conversations";
import { ApiError, json, readJson, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const notFound = () => new ApiError(404, "not_found", "This conversation does not exist.");

/**
 * Returns one page of messages, newest page first. `?before=<message id>`
 * continues with the messages that precede the given one.
 */
export const GET = route<Context>(async (request, { params }) => {
  const { user } = await apiUser();
  const { id } = await params;
  const conversation = getConversation(user.id, id);
  if (!conversation) throw notFound();

  const before = request.nextUrl.searchParams.get("before");
  let beforeSeq: number | undefined;
  if (before) {
    beforeSeq = findMessageSeq(conversation.id, before.slice(0, 64));
    if (beforeSeq === undefined) throw new ApiError(400, "invalid_request", "Unknown message.");
  }
  const page = listMessagePage(conversation.id, MESSAGE_PAGE_SIZE, beforeSeq);
  return json({
    conversation: toSummary(conversation),
    messages: page.rows.map(toChatMessage),
    hasMore: page.hasMore,
  });
});

const patchSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX_LENGTH) });

export const PATCH = route<Context>(async (request, { params }) => {
  const { user } = await apiUser();
  const { id } = await params;
  const input = await readJson(request, patchSchema);
  if (!renameConversation(user.id, id, input.title)) throw notFound();
  return json({ conversation: toSummary(getConversation(user.id, id)!) });
});

export const DELETE = route<Context>(async (_request, { params }) => {
  const { user } = await apiUser();
  const { id } = await params;
  if (!deleteConversation(user.id, id)) throw notFound();
  return json({ ok: true });
});
