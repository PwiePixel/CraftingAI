import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Code, Download, Gem, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { getAuth } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";
import { TIER_IDS, type TierId } from "@/lib/shared/types";

const tierIcons: Record<TierId, typeof Zap> = { lite: Zap, pro: Sparkles, ultra: Gem };

const features = [
  {
    icon: Zap,
    title: "Answers in seconds",
    text: "Replies stream in as they are written, so you never stare at a spinner.",
  },
  {
    icon: Code,
    title: "Made for real work",
    text: "Clean formatting for code, tables and mathematics, with one-click copy.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    text: "No ads and no tracking. Your conversations are yours and never sold.",
  },
  {
    icon: Download,
    title: "You stay in control",
    text: "Export everything or delete your chats and your account whenever you like.",
  },
];

export default async function LandingPage() {
  if (await getAuth()) redirect("/chat");
  const settings = getSettings();
  const { siteName, assistantName } = settings;
  const tiers = TIER_IDS.filter((id) => settings.tiers[id].enabled).map((id) => ({
    id,
    ...settings.tiers[id],
  }));
  const primaryHref = settings.registrationOpen ? "/register" : "/login";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Logo name={siteName} />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonClass("ghost", "sm")}>
            Sign in
          </Link>
          {settings.registrationOpen ? (
            <Link href="/register" className={buttonClass("primary", "sm")}>
              Get started
            </Link>
          ) : null}
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-12 pb-16 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
              <Sparkles size={13} />
              Free to use
            </p>
            <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Meet {assistantName}, the AI assistant that gets things done.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
              Ask questions, draft texts, untangle code and think through ideas. {siteName} gives
              you clear answers in a fast, distraction-free chat.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={primaryHref} className={buttonClass("primary", "lg")}>
                Start chatting
                <ArrowRight size={18} />
              </Link>
              <Link href="/login" className={buttonClass("secondary", "lg")}>
                I already have an account
              </Link>
            </div>
            <p className="mt-4 text-sm text-fg-subtle">No credit card. No ads. No tracking.</p>
          </div>

          {/* Illustrative conversation */}
          <div aria-hidden="true" className="rounded-3xl border border-border bg-bg-subtle p-3 shadow-pop sm:p-4">
            <div className="flex flex-col gap-5 rounded-2xl bg-bg p-5 sm:p-6">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-3xl bg-surface-2 px-4 py-2.5 text-sm leading-relaxed">
                  Can you explain recursion in one sentence, with a tiny example?
                </div>
              </div>
              <div className="flex gap-3">
                <LogoMark size={26} className="mt-0.5" />
                <div className="min-w-0 flex-1 text-sm leading-relaxed">
                  <p className="mb-1 text-xs font-medium text-fg-muted">{tiers[0]?.label ?? assistantName}</p>
                  <p>
                    Recursion is when a function solves a problem by calling itself on a smaller
                    version of the same problem, until it reaches a case simple enough to answer
                    directly.
                  </p>
                  <div className="mt-3 overflow-hidden rounded-xl border border-border bg-code-bg">
                    <div className="border-b border-border px-3.5 py-1.5 font-mono text-xs text-fg-muted">
                      python
                    </div>
                    <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[0.8rem] leading-relaxed">
                      <span className="text-(--hl-keyword)">def</span>{" "}
                      <span className="text-(--hl-title)">countdown</span>(n):{"\n"}
                      {"    "}
                      <span className="text-(--hl-keyword)">if</span> n =={" "}
                      <span className="text-(--hl-number)">0</span>:{"\n"}
                      {"        "}
                      <span className="text-(--hl-keyword)">return</span>{" "}
                      <span className="text-(--hl-string)">&quot;Lift-off!&quot;</span>
                      {"\n"}
                      {"    "}
                      <span className="text-(--hl-keyword)">return</span> countdown(n -{" "}
                      <span className="text-(--hl-number)">1</span>)
                    </pre>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-full border border-border-strong bg-surface py-2 pr-2 pl-5 text-sm text-fg-subtle">
                Message {assistantName}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-fg">
                  <ArrowRight size={16} className="-rotate-90" />
                </span>
              </div>
            </div>
          </div>
        </section>

        {tiers.length > 0 ? (
          <section className="border-y border-border bg-bg-subtle">
            <div className="mx-auto w-full max-w-6xl px-5 py-16">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                The right model for every task
              </h2>
              <p className="mt-2 max-w-2xl text-fg-muted">
                Switch models at any time, even in the middle of a conversation.
              </p>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {tiers.map((tier) => {
                  const Icon = tierIcons[tier.id];
                  return (
                    <div key={tier.id} className="rounded-2xl border border-border bg-surface p-6">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                        <Icon size={19} />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold">{tier.label}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{tier.description}</p>
                      <p className="mt-4 text-sm font-medium">
                        {tier.dailyLimit} messages per day
                        <span className="font-normal text-fg-muted"> · free</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        <section className="mx-auto w-full max-w-6xl px-5 py-16">
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <Icon size={22} className="text-accent" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-fg-muted">
          <span>
            © {new Date().getUTCFullYear()} {siteName}
          </span>
          <nav className="flex flex-wrap gap-x-5 gap-y-1">
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
          </nav>
        </div>
      </footer>
    </div>
  );
}
