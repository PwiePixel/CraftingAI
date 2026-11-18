import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Code,
  Construction,
  Download,
  Gem,
  Lightbulb,
  PenLine,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { getAuth } from "@/lib/server/auth";
import { planCards } from "@/lib/server/plans";
import { getSettings } from "@/lib/server/settings";
import { TIER_IDS, type TierId } from "@/lib/shared/types";

const tierIcons: Record<TierId, typeof Zap> = { lite: Zap, pro: Sparkles, ultra: Gem };

const baseNavigation = [
  { href: "#about", label: "About" },
  { href: "#models", label: "Models" },
  { href: "#plans", label: "Plans" },
  { href: "#privacy", label: "Privacy" },
  { href: "#status", label: "Status" },
  { href: "#faq", label: "FAQ" },
];

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {text ? <p className="mt-3 leading-relaxed text-fg-muted">{text}</p> : null}
    </div>
  );
}

export default async function HomePage() {
  const signedIn = Boolean(await getAuth());
  const settings = getSettings();
  const { siteName, assistantName, inDevelopment, registrationOpen } = settings;
  const selfHosted = settings.modelHosting === "self-hosted";
  const plans = planCards(settings);
  const hasPaidPlans = plans.some((plan) => plan.paid);
  const navigation = baseNavigation.filter((item) => item.href !== "#plans" || hasPaidPlans);
  const sources = settings.baseModelSources;
  const basedOn = sources ? `openly available models from ${sources}` : "openly available models";
  const contactEmail = settings.legal.contactEmail;
  const tiers = TIER_IDS.filter((id) => settings.tiers[id].enabled).map((id) => ({
    id,
    ...settings.tiers[id],
  }));

  const primary = signedIn
    ? { href: "/chat", label: "Open chat" }
    : registrationOpen
      ? { href: "/register", label: "Start chatting" }
      : { href: "/login", label: "Sign in" };

  const useCases = [
    {
      icon: Lightbulb,
      title: "Ask and understand",
      text: "Get clear explanations for anything from tax terms to quantum physics, at the level you ask for.",
    },
    {
      icon: PenLine,
      title: "Write and edit",
      text: "Draft emails, posts and letters, tighten your wording, summarise long texts or translate them.",
    },
    {
      icon: Code,
      title: "Code and debug",
      text: "Have code written, explained or reviewed, with syntax highlighting and one-click copy.",
    },
    {
      icon: BookOpen,
      title: "Plan and brainstorm",
      text: "Think through ideas, compare options, and turn loose thoughts into a structured plan.",
    },
  ];

  const steps = [
    {
      title: "Create a free account",
      text: "An email address and a password are all you need. It takes less than a minute.",
    },
    {
      title: "Pick a model",
      text: "Choose the fast everyday model or a more capable one. You can switch at any time.",
    },
    {
      title: "Start the conversation",
      text: `Write your message. ${assistantName} answers within seconds, and your chats are saved so you can pick up later.`,
    },
  ];

  const principles = [
    {
      icon: ShieldCheck,
      title: "Private by default",
      text: "No advertising and no tracking. Your conversations are never sold.",
    },
    {
      icon: Download,
      title: "You stay in control",
      text: "Export your data, or delete single chats, all chats or your whole account whenever you like.",
    },
    {
      icon: Server,
      title: "Hosted by us",
      text: selfHosted
        ? "The site, your chats and the models themselves all run on servers we operate ourselves."
        : "The site, your account and your chat history live on a server we operate ourselves.",
    },
  ];

  const availableToday = [
    "Live, streaming answers",
    tiers.length > 1 ? `${tiers.length} models to choose from` : "A fast everyday model",
    "Saved conversations with search",
    "Formatted code, tables and mathematics",
    "Light and dark mode on desktop and mobile",
    "Data export and account deletion",
  ];

  const expectations = [
    {
      title: "Things will change",
      text: "Features, model names and daily limits may be adjusted as the project grows.",
    },
    {
      title: "Short interruptions are possible",
      text: "The site can be briefly unavailable during updates, or pause when the day's capacity is used up.",
    },
    {
      title: "Answers can be wrong",
      text: `Like every AI assistant, ${assistantName} makes mistakes. Double-check anything that matters.`,
    },
    ...(selfHosted
      ? [
          {
            title: "Our models are test versions",
            text: `${assistantName} runs on our own models, which we are still developing. Their quality and behaviour can change from one day to the next.`,
          },
        ]
      : []),
  ];

  const questions = [
    {
      question: `Is ${siteName} free?`,
      answer: hasPaidPlans
        ? "Yes, the free plan stays free. Every account gets a daily number of messages for each model, and the limits reset at midnight UTC. If you need more, paid plans with higher limits are available."
        : "Yes. Every account gets a daily number of messages for each model. The limits reset at midnight UTC.",
    },
    {
      question: "Do I need an account?",
      answer:
        "Yes. A free account keeps your conversations private to you and makes fair daily limits possible.",
    },
    {
      question: `Who is behind ${assistantName}?`,
      answer: selfHosted
        ? `${assistantName} is our own assistant, built and run by the ${siteName} team. It runs on our own test models, which we are currently developing on the basis of ${basedOn}. The models, the site and your conversations are all hosted on servers we operate ourselves, so your messages are not passed on to outside AI providers.`
        : `${assistantName} is our own assistant, built and run by the ${siteName} team. We design how it behaves, operate the site, and keep your account and your conversations on a server we run ourselves. To write its answers, ${assistantName} uses large language models, including models operated by third-party providers. The Privacy Policy explains what is shared with them.`,
    },
    {
      question: "What happens to my conversations?",
      answer:
        "They are stored in your account so you can return to them. They are not used for advertising and not sold. You can delete them at any time in the settings.",
    },
    {
      question: "Can I rely on the answers?",
      answer: `Treat them as a helpful starting point. ${assistantName} can be wrong or out of date and does not replace professional advice.`,
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" className="rounded-lg">
            <Logo name={siteName} />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link href="/chat" className={buttonClass("primary", "sm")}>
                Open chat
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonClass("ghost", "sm")}>
                  Sign in
                </Link>
                {registrationOpen ? (
                  <Link href="/register" className={buttonClass("primary", "sm")}>
                    Get started
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-12 pb-16 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-24">
          <div>
            {inDevelopment ? (
              <a
                href="#status"
                className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning"
              >
                <Construction size={13} />
                In development · early preview
              </a>
            ) : (
              <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                <Sparkles size={13} />
                Free to use
              </p>
            )}
            <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Meet {assistantName}, the AI assistant that gets things done.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
              {siteName} is a free AI chat assistant for questions, writing, code and ideas. Clear
              answers in a fast, distraction-free chat, without ads and without tracking.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={primary.href} className={buttonClass("primary", "lg")}>
                {primary.label}
                <ArrowRight size={18} />
              </Link>
              <a href="#about" className={buttonClass("secondary", "lg")}>
                Learn more
              </a>
            </div>
            <p className="mt-4 text-sm text-fg-subtle">
              {!signedIn && !registrationOpen
                ? "Registration is currently closed."
                : "No credit card. No ads. No tracking."}
            </p>
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

        {/* About */}
        <section id="about" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
            <SectionHeading
              eyebrow={`About ${siteName}`}
              title="An AI assistant you can simply talk to"
              text={
                selfHosted
                  ? `${siteName} is the home of ${assistantName}, our own AI assistant. ${assistantName} runs on our own test models, which we are currently developing on the basis of ${basedOn}, and everything runs on servers we operate ourselves. You write a message in plain language and ${assistantName} replies within seconds: explaining, drafting, summarising, translating, debugging or brainstorming with you. There is nothing to install, and your conversations are saved to your account so you can continue them later on any device.`
                  : `${siteName} is the home of ${assistantName}, our own AI assistant, which we are building and running ourselves. You write a message in plain language and ${assistantName} replies within seconds: explaining, drafting, summarising, translating, debugging or brainstorming with you. There is nothing to install, and your conversations are saved to your account so you can continue them later on any device.`
              }
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {useCases.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-border bg-surface p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Icon size={19} />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{text}</p>
                </div>
              ))}
            </div>

            <h3 className="mt-14 text-lg font-semibold">How it works</h3>
            <ol className="mt-5 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Models */}
        {tiers.length > 0 ? (
          <section id="models" className="scroll-mt-20 border-y border-border bg-bg-subtle">
            <div className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
              <SectionHeading
                eyebrow="Models"
                title="The right model for every task"
                text={`Use the fast model for everyday questions and a more capable one when a problem needs more depth. You can switch at any time, even in the middle of a conversation.${
                  selfHosted ? " All of them are our own test models and still in development." : ""
                }`}
              />
              <div className="mt-10 grid gap-4 md:grid-cols-3">
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
                        {tier.dailyLimit} {tier.dailyLimit === 1 ? "message" : "messages"} per day
                        <span className="font-normal text-fg-muted"> · free</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {/* Plans */}
        {hasPaidPlans ? (
          <section id="plans" className="scroll-mt-20">
            <div className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
              <SectionHeading
                eyebrow="Plans"
                title="Start free, upgrade when you need more"
                text="The free plan covers everyday use. Paid plans raise the limits and let them refresh on a rolling basis instead of once a day. You can cancel at any time."
              />
              <div className={`mt-10 grid gap-4 ${plans.length > 2 ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`flex flex-col rounded-2xl border bg-surface p-6 ${plan.highlighted ? "border-accent" : "border-border"}`}
                  >
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <p className="mt-2 text-3xl font-semibold tracking-tight">
                      {plan.price ?? "Free"}
                      {plan.price ? <span className="text-sm font-normal text-fg-muted"> / month</span> : null}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">{plan.description}</p>
                    <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm">
                      {[...plan.limits, ...plan.features].map((line) => (
                        <li key={line} className="flex items-start gap-2">
                          <Check size={16} className="mt-0.5 shrink-0 text-success" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={signedIn ? "/settings/plan" : primary.href}
                      className={`${buttonClass(plan.highlighted ? "primary" : "secondary", "md")} mt-6`}
                    >
                      {plan.paid ? `Choose ${plan.name}` : "Start for free"}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Privacy and control */}
        <section id="privacy" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
            <SectionHeading
              eyebrow="Privacy and control"
              title="Your conversations belong to you"
              text="We collect only what is needed to run the service. The details are written down in plain language in the Privacy Policy."
            />
            <div className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-3">
              {principles.map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <Icon size={22} className="text-accent" />
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{text}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 text-sm text-fg-muted">
              Read the{" "}
              <Link href="/privacy" className="font-medium text-accent hover:underline">
                Privacy Policy
              </Link>{" "}
              and the{" "}
              <Link href="/terms" className="font-medium text-accent hover:underline">
                Terms of Use
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Project status */}
        <section id="status" className="scroll-mt-20 border-y border-border bg-bg-subtle">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
            {inDevelopment ? (
              <>
                <SectionHeading
                  eyebrow="Project status"
                  title={`${siteName} is currently in development`}
                  text={`${siteName} is a young project that is still being built. You are welcome to use it today, and we are improving it continuously. Until it is finished, please keep a few things in mind.`}
                />
                <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <div className="rounded-2xl border border-border bg-surface p-6">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Construction size={18} className="text-warning" />
                      What to expect during development
                    </h3>
                    <ul className="mt-4 flex flex-col gap-4">
                      {expectations.map((item) => (
                        <li key={item.title}>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{item.text}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface p-6">
                    <h3 className="font-semibold">Available today</h3>
                    <ul className="mt-4 flex flex-col gap-2.5">
                      {availableToday.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm">
                          <Check size={16} className="mt-0.5 shrink-0 text-success" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {contactEmail ? (
                  <p className="mt-6 text-sm text-fg-muted">
                    Found a problem or have an idea? Write to{" "}
                    <a href={`mailto:${contactEmail}`} className="font-medium text-accent hover:underline">
                      {contactEmail}
                    </a>
                    .
                  </p>
                ) : null}
              </>
            ) : (
              <SectionHeading
                eyebrow="Project status"
                title={`${siteName} is up and running`}
                text={`All features described on this page are available. Like every AI assistant, ${assistantName} can make mistakes, so double-check anything that matters.`}
              />
            )}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-3xl px-5 py-16 lg:py-20">
            <SectionHeading eyebrow="FAQ" title="Questions and answers" />
            <div className="mt-8 divide-y divide-border border-y border-border">
              {questions.map((item) => (
                <details key={item.question} className="group py-4">
                  <summary className="flex list-none items-center justify-between gap-4 rounded-lg font-medium [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <ChevronDown
                      size={18}
                      className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="mt-2.5 pr-8 text-sm leading-relaxed text-fg-muted">{item.answer}</p>
                </details>
              ))}
            </div>
            <div className="mt-12 flex flex-col items-center gap-4 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">Ready to try {assistantName}?</h2>
              <Link href={primary.href} className={buttonClass("primary", "lg")}>
                {primary.label}
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-fg-muted">
          <span>
            © {new Date().getUTCFullYear()} {siteName}
          </span>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1">
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
