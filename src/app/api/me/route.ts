import { z } from "zod";
import { apiUser, endSession } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { ApiError, clientIp, json, readJson, route } from "@/lib/server/http";
import { verifyPassword } from "@/lib/server/password";
import { rateLimit } from "@/lib/server/ratelimit";
import { getSettings, publicSite } from "@/lib/server/settings";
import { publicTiers } from "@/lib/server/usage";
import { countAdmins, deleteUser, findUserById, toSessionUser, updateUser } from "@/lib/server/users";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { user } = await apiUser();
  const settings = getSettings();
  return json({
    user: toSessionUser(user),
    tiers: publicTiers(user, settings),
    site: publicSite(settings),
  });
});

const patchSchema = z.object({ name: z.string().trim().max(60) });

export const PATCH = route(async (request) => {
  const { user } = await apiUser();
  const input = await readJson(request, patchSchema);
  updateUser(user.id, { name: input.name });
  return json({ user: toSessionUser(findUserById(user.id)!) });
});

const deleteSchema = z.object({ password: z.string().min(1).max(128) });

/** Permanently deletes the account together with all conversations. */
export const DELETE = route(async (request) => {
  const { user } = await apiUser();
  const input = await readJson(request, deleteSchema);
  const limit = rateLimit(`delete-account:${user.id}`, 5, 15 * 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", "Too many attempts. Please try again later.", limit.retryAfter);
  }
  if (!(await verifyPassword(user.password_hash, input.password))) {
    throw new ApiError(403, "invalid_credentials", "The password is incorrect.");
  }
  if (user.role === "admin" && countAdmins() <= 1) {
    throw new ApiError(
      409,
      "last_admin",
      "You are the only administrator. Promote another administrator before deleting this account.",
    );
  }
  audit({ action: "user.delete_self", actor: user, target: user.id, ip: clientIp(request) });
  deleteUser(user.id);
  await endSession();
  return json({ ok: true });
});
