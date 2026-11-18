"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { reloadTo } from "@/lib/client/navigate";

interface Props {
  mode: "login" | "register";
  siteName: string;
  registrationOpen: boolean;
  minimumAge: number;
}

export function AuthForm({ mode, siteName, registrationOpen, minimumAge }: Props) {
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [confirmAge, setConfirmAge] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const closed = isRegister && !registrationOpen;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    if (isRegister && (!acceptTerms || !confirmAge)) {
      setError("Please accept the terms and confirm your age to continue.");
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await api("/api/auth/register", {
          body: { email, name, password, acceptTerms, confirmAge, website },
        });
      } else {
        await api("/api/auth/login", { body: { email, password } });
      }
      // Full navigation so every server component sees the new session.
      reloadTo("/chat");
    } catch (failure) {
      setError(errorMessage(failure));
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[26rem] rounded-3xl border border-border bg-surface p-7 shadow-sm sm:p-9">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isRegister ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        {isRegister ? `Start chatting with ${siteName} in seconds.` : `Sign in to continue to ${siteName}.`}
      </p>

      {closed ? (
        <Alert tone="warning" className="mt-6">
          Registration is currently closed. Please check back later.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          {error ? <Alert>{error}</Alert> : null}

          {isRegister ? (
            <Field label="Name (optional)" htmlFor="name">
              <Input
                id="name"
                name="name"
                autoComplete="name"
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          ) : null}

          <Field label="Email address" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            hint={isRegister ? "At least 10 characters. A passphrase of several words works well." : undefined}
          >
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 10 : undefined}
                maxLength={128}
                className="pr-11"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </Field>

          {isRegister ? (
            <>
              {/* Honeypot field: hidden from people, tempting for bots. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Website
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </label>
              </div>

              <label className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-(--accent)"
                  checked={acceptTerms}
                  onChange={(event) => setAcceptTerms(event.target.checked)}
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-fg underline underline-offset-2">
                    Terms of Use
                  </Link>{" "}
                  and the{" "}
                  <Link
                    href="/acceptable-use"
                    target="_blank"
                    className="font-medium text-fg underline underline-offset-2"
                  >
                    Acceptable Use Policy
                  </Link>
                  , and I have read the{" "}
                  <Link href="/privacy" target="_blank" className="font-medium text-fg underline underline-offset-2">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-(--accent)"
                  checked={confirmAge}
                  onChange={(event) => setConfirmAge(event.target.checked)}
                />
                <span>I am at least {minimumAge} years old.</span>
              </label>
            </>
          ) : null}

          <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
            {isRegister ? "Create account" : "Sign in"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-fg-muted">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </>
        ) : registrationOpen ? (
          <>
            New to {siteName}?{" "}
            <Link href="/register" className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
