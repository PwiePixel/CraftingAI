export const TIER_IDS = ["lite", "pro", "ultra"] as const;
export type TierId = (typeof TIER_IDS)[number];

export function isTierId(value: unknown): value is TierId {
  return typeof value === "string" && (TIER_IDS as readonly string[]).includes(value);
}

export type Role = "user" | "admin";
export type UserStatus = "active" | "suspended";
export type MessageRole = "user" | "assistant";
export type MessageStatus = "complete" | "stopped" | "truncated" | "refused" | "error";
export type ThemePreference = "system" | "light" | "dark";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Changes whenever the profile picture changes; null when there is none. */
  avatarVersion: number | null;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  tier: TierId | null;
  status: MessageStatus;
  createdAt: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  tier: TierId;
  createdAt: number;
  updatedAt: number;
}

export type UsageWindowKind = "day" | "fiveHour" | "week";

/** One limit that applies to a model: how much of it is used and when room frees up. */
export interface UsageWindow {
  kind: UsageWindowKind;
  limit: number;
  used: number;
  /** When the next message becomes available (if the limit is reached) or the window starts to clear. */
  resetsAt: number | null;
}

/** What a signed-in user may know about a model tier. Never includes the upstream model. */
export interface PublicTier {
  id: TierId;
  label: string;
  description: string;
  enabled: boolean;
  /** False when the user's plan does not contain this model. */
  included: boolean;
  /** Messages that can be sent right now; `null` means unlimited. */
  remaining: number | null;
  /** The limit that is currently exhausted, if any. */
  blockedBy: UsageWindow | null;
  windows: UsageWindow[];
}

/** The plan a user is on, as shown in the interface. */
export interface PublicPlan {
  id: string;
  name: string;
  paid: boolean;
}

export interface PublicLegal {
  operatorName: string;
  operatorAddress: string;
  contactEmail: string;
  governingLaw: string;
  minimumAge: number;
  effectiveDate: string;
}

export interface PublicSite {
  siteName: string;
  assistantName: string;
  tagline: string;
  announcement: string;
  registrationOpen: boolean;
  maxMessageChars: number;
  defaultTier: TierId;
  legal: PublicLegal;
}

/** Events sent over the chat stream (server-sent events). */
export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; title: string; userMessageId: string | null }
  | { type: "delta"; text: string }
  | {
      type: "done";
      /** `null` when the reply was stopped before any text arrived. */
      message: ChatMessage | null;
      tier: PublicTier;
    }
  | { type: "title"; title: string }
  | { type: "error"; code: string; message: string };

export interface ApiErrorBody {
  error: { code: string; message: string; retryAfter?: number };
}
