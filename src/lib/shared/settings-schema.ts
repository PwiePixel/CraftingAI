import { z } from "zod";
import { TIER_IDS } from "./types";

export const EFFORT_LEVELS = ["default", "low", "medium", "high"] as const;

export const tierSettingsSchema = z.object({
  /** Name shown to users. */
  label: z.string().trim().min(1).max(40),
  description: z.string().trim().max(160),
  /** Upstream model identifier. Only ever visible to administrators. */
  model: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:@/-]{1,100}$/, "Invalid model identifier"),
  enabled: z.boolean(),
  /** Messages per user per day (UTC). 0 disables the tier for regular users. */
  dailyLimit: z.number().int().min(0).max(100_000),
  maxOutputTokens: z.number().int().min(256).max(64_000),
  effort: z.enum(EFFORT_LEVELS),
  /** Approximate size of the conversation history sent upstream, in characters. */
  contextChars: z.number().int().min(4_000).max(2_000_000),
  /** Retry on a substitute model when the primary model declines a request. */
  refusalFallback: z.boolean(),
  inputPricePerMTok: z.number().min(0).max(1_000),
  outputPricePerMTok: z.number().min(0).max(1_000),
});

export const legalSettingsSchema = z.object({
  operatorName: z.string().trim().max(120),
  operatorAddress: z.string().trim().max(400),
  contactEmail: z.union([z.literal(""), z.email().max(200)]),
  governingLaw: z.string().trim().max(120),
  minimumAge: z.number().int().min(13).max(21),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
});

export const settingsSchema = z.object({
  siteName: z.string().trim().min(1).max(40),
  assistantName: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(120),
  announcement: z.string().trim().max(300),
  registrationOpen: z.boolean(),
  /** Extra instructions appended to the built-in system prompt. */
  customInstructions: z.string().max(4_000),
  defaultTier: z.enum(TIER_IDS),
  /** Global spending cap per UTC day in USD. 0 disables the cap. */
  dailyBudgetUsd: z.number().min(0).max(1_000_000),
  maxMessageChars: z.number().int().min(500).max(200_000),
  tiers: z.object({
    lite: tierSettingsSchema,
    pro: tierSettingsSchema,
    ultra: tierSettingsSchema,
  }),
  legal: legalSettingsSchema,
});

export type TierSettings = z.infer<typeof tierSettingsSchema>;
export type LegalSettings = z.infer<typeof legalSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;

/** Version identifier of the bundled legal texts; stored when a user accepts them. */
export const TERMS_VERSION = "2026-11-18";

export const DEFAULT_SETTINGS: Settings = {
  siteName: "CraftingAI",
  assistantName: "Crafting",
  tagline: "Your everyday AI assistant.",
  announcement: "",
  registrationOpen: true,
  customInstructions: "",
  defaultTier: "lite",
  dailyBudgetUsd: 10,
  maxMessageChars: 16_000,
  tiers: {
    lite: {
      label: "Craft Lite",
      description: "Fast and efficient for everyday questions.",
      model: "claude-haiku-5-5",
      enabled: true,
      dailyLimit: 50,
      maxOutputTokens: 4_096,
      effort: "low",
      contextChars: 60_000,
      refusalFallback: false,
      inputPricePerMTok: 0.1,
      outputPricePerMTok: 0.5,
    },
    pro: {
      label: "Craft Pro",
      description: "More depth for writing, analysis and code.",
      model: "claude-sonnet-5-5",
      enabled: true,
      dailyLimit: 10,
      maxOutputTokens: 4_096,
      effort: "low",
      contextChars: 80_000,
      refusalFallback: true,
      inputPricePerMTok: 2,
      outputPricePerMTok: 10,
    },
    ultra: {
      label: "Craft Ultra",
      description: "Our most capable model for the hardest problems.",
      model: "claude-opus-5-5",
      enabled: true,
      dailyLimit: 3,
      maxOutputTokens: 6_000,
      effort: "medium",
      contextChars: 80_000,
      refusalFallback: true,
      inputPricePerMTok: 4,
      outputPricePerMTok: 20,
    },
  },
  legal: {
    operatorName: "",
    operatorAddress: "",
    contactEmail: "",
    governingLaw: "",
    minimumAge: 16,
    effectiveDate: TERMS_VERSION,
  },
};
