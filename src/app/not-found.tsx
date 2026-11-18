import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <LogoMark size={44} />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/" className={buttonClass("primary", "md", "mt-3")}>
        Go to the home page
      </Link>
    </main>
  );
}
