import "server-only";
import { z } from "zod";
import { audit } from "./audit";
import { hashIp } from "./ids";
import { ApiError } from "./http";
import {
  burnPasswordCheck,
  hashPassword,
  passwordProblem,
  PASSWORD_MAX_LENGTH,
  verifyPassword,
} from "./password";
import { rateLimit } from "./ratelimit";
import { getSettings } from "./settings";
import {
  createUser,
  findUserByEmail,
  markLogin,
  normalizeEmail,
  type UserRow,
} from "./users";
import { TERMS_VERSION } from "@/lib/shared/settings-schema";

const MINUTE = 60_000;

export const emailSchema = z
  .email("Please enter a valid email address.")
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(60).default(""),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  acceptTerms: z.literal(true, {
    error: "You need to accept the Terms of Use and the Privacy Policy.",
  }),
  confirmAge: z.literal(true, { error: "Please confirm that you meet the minimum age." }),
  // Honeypot: real visitors never see or fill this field.
  website: z.string().max(200).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

function tooMany(retryAfter: number): ApiError {
  return new ApiError(
    429,
    "rate_limited",
    "Too many attempts. Please wait a few minutes and try again.",
    retryAfter,
  );
}

export async function registerAccount(
  input: z.infer<typeof registerSchema>,
  ip: string | null,
): Promise<UserRow> {
  const settings = getSettings();
  if (!settings.registrationOpen) {
    throw new ApiError(403, "registration_closed", "Registration is currently closed.");
  }
  const ipKey = hashIp(ip) ?? "unknown";
  const limit = rateLimit(`register:${ipKey}`, 5, 60 * MINUTE);
  if (!limit.ok) throw tooMany(limit.retryAfter);

  if (input.website) {
    // Filled honeypot: almost certainly a bot. Reject without saying why.
    throw new ApiError(400, "invalid_request", "Registration could not be completed.");
  }
  const problem = passwordProblem(input.password, input.email);
  if (problem) throw new ApiError(400, "weak_password", problem);

  if (findUserByEmail(input.email)) {
    throw new ApiError(409, "email_taken", "An account with this email address already exists.");
  }
  const user = createUser({
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    termsVersion: TERMS_VERSION,
  });
  audit({ action: "user.register", actor: user, target: user.id, ip });
  return user;
}

export async function authenticate(
  input: z.infer<typeof loginSchema>,
  ip: string | null,
): Promise<UserRow> {
  const email = normalizeEmail(input.email);
  const ipKey = hashIp(ip) ?? "unknown";

  // Limits apply whether or not the account exists, so they reveal nothing.
  const byIp = rateLimit(`login-ip:${ipKey}`, 30, 15 * MINUTE);
  if (!byIp.ok) throw tooMany(byIp.retryAfter);
  const byAccount = rateLimit(`login-account:${email}`, 10, 15 * MINUTE);
  if (!byAccount.ok) throw tooMany(byAccount.retryAfter);

  const invalid = new ApiError(401, "invalid_credentials", "Incorrect email address or password.");
  const user = findUserByEmail(email);
  if (!user) {
    await burnPasswordCheck(input.password);
    throw invalid;
  }
  if (!(await verifyPassword(user.password_hash, input.password))) {
    audit({ action: "user.login_failed", target: user.id, ip });
    throw invalid;
  }
  if (user.status !== "active") {
    throw new ApiError(
      403,
      "account_suspended",
      "This account has been suspended. Contact support if you think this is a mistake.",
    );
  }
  markLogin(user.id);
  audit({ action: "user.login", actor: user, target: user.id, ip });
  return user;
}
