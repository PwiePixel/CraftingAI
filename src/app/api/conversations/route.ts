import { apiUser } from "@/lib/server/auth";
import { deleteAllConversations, listConversations } from "@/lib/server/conversations";
import { json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { user } = await apiUser();
  return json({ conversations: listConversations(user.id) });
});

export const DELETE = route(async () => {
  const { user } = await apiUser();
  return json({ deleted: deleteAllConversations(user.id) });
});
