import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { getAuth } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";

const links = [
  { href: "/terms", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/imprint", label: "Legal Notice" },
];

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const { siteName } = getSettings();
  const signedIn = Boolean(await getAuth());
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <Link href="/" className="rounded-lg">
            <Logo name={siteName} />
          </Link>
          <Link href={signedIn ? "/chat" : "/login"} className={buttonClass("secondary", "sm")}>
            {signedIn ? "Back to chat" : "Sign in"}
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 py-10 md:flex-row md:py-14">
        <nav aria-label="Legal documents" className="md:w-52 md:shrink-0">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm md:sticky md:top-10 md:flex-col md:gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-lg text-fg-muted hover:text-fg md:px-3 md:py-1.5 md:hover:bg-surface-2"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 max-w-2xl flex-1">{children}</main>
      </div>
      <footer className="border-t border-border px-5 py-6 text-center text-xs text-fg-muted">
        © {new Date().getUTCFullYear()} {siteName}
      </footer>
    </div>
  );
}
