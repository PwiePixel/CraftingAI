import Link from "next/link";
import { Logo } from "@/components/logo";
import { hasPaidPlans } from "@/lib/server/plans";
import { getSettings } from "@/lib/server/settings";
import { legalLinks } from "@/lib/shared/legal-links";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  const { siteName } = settings;
  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex rounded-lg">
          <Logo name={siteName} />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">{children}</main>
      <footer className="flex flex-wrap justify-center gap-x-5 gap-y-1 px-6 py-6 text-xs text-fg-muted">
        {legalLinks(hasPaidPlans(settings)).map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-fg">
            {link.label}
          </Link>
        ))}
      </footer>
    </div>
  );
}
