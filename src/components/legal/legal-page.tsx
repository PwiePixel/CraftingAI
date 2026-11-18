import type { ReactNode } from "react";
import { formatLongDate } from "@/lib/shared/format";

export function LegalPage({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate?: string;
  children: ReactNode;
}) {
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {effectiveDate ? (
        <p className="mt-3 text-sm text-fg-muted">Effective date: {formatLongDate(effectiveDate)}</p>
      ) : null}
      <div className="md mt-8">{children}</div>
    </article>
  );
}

/** Operator contact line used across the legal texts. */
export function ContactEmail({ email }: { email: string }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <span>the contact details in our Legal Notice</span>;
}
