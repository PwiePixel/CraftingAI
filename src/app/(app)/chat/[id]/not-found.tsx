import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function ConversationNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Chat not found</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        This conversation does not exist or has been deleted.
      </p>
      <Link href="/chat" className={buttonClass("primary", "md", "mt-2")}>
        Start a new chat
      </Link>
    </div>
  );
}
