"use client";

import { useEffect, useState } from "react";
import { useShell } from "@/components/app/shell";
import { ChatView, type InitialConversation } from "./chat-view";

/**
 * Hosts the chat view for both `/chat` (a new conversation) and `/chat/[id]`.
 *
 * When a new conversation is saved, the address bar is updated to its
 * permanent URL with the History API instead of a navigation, so the reply
 * that is still streaming is not interrupted.
 */
export function ChatRoute({ initial }: { initial: InitialConversation | null }) {
  const { chatSession, conversations, site } = useShell();
  const [adopted, setAdopted] = useState<{ session: number; id: string } | null>(null);

  const isNew = initial === null;
  const adoptedId = adopted && adopted.session === chatSession ? adopted.id : null;

  useEffect(() => {
    if (!isNew || !adoptedId) return;
    const target = `/chat/${adoptedId}`;
    if (window.location.pathname !== target) window.history.replaceState(null, "", target);
  }, [isNew, adoptedId]);

  const adoptedTitle = adoptedId
    ? conversations.find((item) => item.id === adoptedId)?.title
    : undefined;
  useEffect(() => {
    if (adoptedTitle) document.title = `${adoptedTitle} · ${site.siteName}`;
  }, [adoptedTitle, site.siteName]);

  // Back/forward can land on an address that this view is not showing (an
  // earlier conversation whose URL was set as described above). Load it fresh.
  useEffect(() => {
    if (!isNew) return;
    const expected = adoptedId ? `/chat/${adoptedId}` : "/chat";
    const check = () => {
      const { pathname } = window.location;
      if (pathname.startsWith("/chat/") && pathname !== expected) window.location.reload();
    };
    if (!adoptedId) check();
    window.addEventListener("popstate", check);
    return () => window.removeEventListener("popstate", check);
  }, [isNew, adoptedId]);

  if (initial) return <ChatView key={initial.conversation.id} initial={initial} />;
  return (
    <ChatView
      key={`new-${chatSession}`}
      initial={null}
      onCreated={(id) => setAdopted({ session: chatSession, id })}
    />
  );
}
