import Link from "next/link";
import { Logo } from "@/components/logo";
import { getSettings } from "@/lib/server/settings";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { siteName } = getSettings();
  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex rounded-lg">
          <Logo name={siteName} />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">{children}</main>
      <footer className="flex flex-wrap justify-center gap-x-5 gap-y-1 px-6 py-6 text-xs text-fg-muted">
        <Link href="/terms" className="hover:text-fg">
          Terms of Use
        </Link>
        <Link href="/privacy" className="hover:text-fg">
          Privacy Policy
        </Link>
        <Link href="/acceptable-use" className="hover:text-fg">
          Acceptable Use
        </Link>
        <Link href="/imprint" className="hover:text-fg">
          Legal Notice
        </Link>
      </footer>
    </div>
  );
}
