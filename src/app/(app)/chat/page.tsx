import type { Metadata } from "next";
import { ChatRoute } from "@/components/chat/chat-route";
import { requireUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "New chat" };

export default async function NewChatPage() {
  await requireUser();
  return <ChatRoute initial={null} />;
}
