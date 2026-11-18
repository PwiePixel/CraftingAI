import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatRoute } from "@/components/chat/chat-route";
import { getAuth, requireUser } from "@/lib/server/auth";
import {
  getConversation,
  listMessageRows,
  toChatMessage,
  toSummary,
} from "@/lib/server/conversations";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const auth = await getAuth();
  if (!auth) return { title: "Chat" };
  const { id } = await params;
  return { title: getConversation(auth.user.id, id)?.title ?? "Chat" };
}

export default async function ConversationPage({ params }: Props) {
  const { user } = await requireUser();
  const { id } = await params;
  // Scoped to the signed-in user: other people's conversations do not exist here.
  const conversation = getConversation(user.id, id);
  if (!conversation) notFound();

  return (
    <ChatRoute
      initial={{
        conversation: toSummary(conversation),
        messages: listMessageRows(conversation.id).map(toChatMessage),
      }}
    />
  );
}
