"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        An unexpected error occurred. Please try again; if the problem persists, come back a little
        later.
      </p>
      <Button onClick={reset} className="mt-3">
        Try again
      </Button>
    </main>
  );
}
