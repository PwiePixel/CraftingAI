import { z } from "zod";
import { apiUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { ApiError, clientIp, json, readJson, route } from "@/lib/server/http";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/server/password";
import { rateLimit } from "@/lib/server/ratelimit";
import { revokeUserSessions } from "@/lib/server/sessions";
import { updateUser } from "@/lib/server/users";

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

export const POST = route(async (request) => {
  const { user, session } = await apiUser();
  const input = await readJson(request, schema);
  const limit = rateLimit(`password:${user.id}`, 5, 15 * 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", "Too many attempts. Please try again later.", limit.retryAfter);
  }
  if (!(await verifyPassword(user.password_hash, input.currentPassword))) {
    throw new ApiError(403, "invalid_credentials", "Your current password is incorrect.");
  }
  const problem = passwordProblem(input.newPassword, user.email);
  if (problem) throw new ApiError(400, "weak_password", problem);
  if (input.newPassword === input.currentPassword) {
    throw new ApiError(400, "weak_password", "The new password must differ from the current one.");
  }
  updateUser(user.id, { password_hash: await hashPassword(input.newPassword) });
  // Every other device is signed out; this session stays valid.
  const revoked = revokeUserSessions(user.id, session.id);
  audit({ action: "user.password_change", actor: user, target: user.id, ip: clientIp(request) });
  return json({ ok: true, revokedSessions: revoked });
});
