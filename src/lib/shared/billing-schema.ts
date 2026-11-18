import { z } from "zod";

/**
 * Message allowance of a paid plan for one model: a short rolling window and
 * a weekly one. A model is part of the plan only when both are above zero.
 */
export const windowLimitsSchema = z.object({
  fiveHour: z.number().int().min(0).max(100_000),
  weekly: z.number().int().min(0).max(1_000_000),
});

const featureList = z.array(z.string().trim().min(1).max(120)).max(10);

export const planSchema = z.object({
  /** Stable identifier; stored with every subscriber, so it never changes. */
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,30}$/, "Use lowercase letters, digits and hyphens")
    .refine((id) => id !== "free", "This identifier is reserved"),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(160),
  /** Monthly price in the smallest currency unit (cents). */
  priceCents: z.number().int().min(50).max(100_000_00),
  /** Disabled plans cannot be bought; existing subscribers keep them. */
  enabled: z.boolean(),
  highlighted: z.boolean(),
  features: featureList,
  limits: z.object({
    lite: windowLimitsSchema,
    pro: windowLimitsSchema,
    ultra: windowLimitsSchema,
  }),
});

export const billingSettingsSchema = z.object({
  /** ISO 4217 code in lower case, as the payment provider expects it. */
  currency: z.string().regex(/^[a-z]{3}$/, "Use a three-letter currency code such as eur"),
  freePlan: z.object({
    name: z.string().trim().min(1).max(40),
    description: z.string().trim().max(160),
    features: featureList,
  }),
  plans: z
    .array(planSchema)
    .max(6)
    .refine((plans) => new Set(plans.map((plan) => plan.id)).size === plans.length, "Plan identifiers must be unique"),
});

export type WindowLimits = z.infer<typeof windowLimitsSchema>;
export type Plan = z.infer<typeof planSchema>;
export type BillingSettings = z.infer<typeof billingSettingsSchema>;

export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_BILLING: BillingSettings = {
  currency: "eur",
  freePlan: {
    name: "Free",
    description: "Everything you need to get started.",
    features: ["Saved conversations", "Export and delete your data at any time"],
  },
  plans: [
    {
      id: "plus",
      name: "Plus",
      description: "More room for everyday work with all models.",
      priceCents: 799,
      enabled: true,
      highlighted: true,
      features: ["Limits refresh on a rolling basis instead of once a day"],
      limits: {
        lite: { fiveHour: 150, weekly: 2_000 },
        pro: { fiveHour: 40, weekly: 300 },
        ultra: { fiveHour: 8, weekly: 50 },
      },
    },
    {
      id: "pro",
      name: "Pro",
      description: "For heavy use, with the highest limits.",
      priceCents: 1_999,
      enabled: true,
      highlighted: false,
      features: ["Limits refresh on a rolling basis instead of once a day"],
      limits: {
        lite: { fiveHour: 400, weekly: 5_000 },
        pro: { fiveHour: 120, weekly: 900 },
        ultra: { fiveHour: 25, weekly: 150 },
      },
    },
  ],
};

export function formatPrice(priceCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Turns a plan name into an identifier that is not in use yet. */
export function planIdFromName(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^[^a-z]+|-+$/g, "")
      .slice(0, 24) || "plan";
  let candidate = base.length < 2 ? `${base}-plan` : base;
  let suffix = 2;
  while (candidate === "free" || taken.includes(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
