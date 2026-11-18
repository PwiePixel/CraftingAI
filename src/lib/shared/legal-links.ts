export interface LegalLink {
  href: string;
  label: string;
}

/** The legal documents in the order they are listed. The purchase terms only appear when something can be bought. */
export function legalLinks(paidPlans: boolean): LegalLink[] {
  return [
    { href: "/terms", label: "Terms of Use" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/acceptable-use", label: "Acceptable Use" },
    ...(paidPlans ? [{ href: "/subscription-terms", label: "Subscription Terms" }] : []),
    { href: "/imprint", label: "Legal Notice" },
  ];
}
