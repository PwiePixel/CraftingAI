import { z } from "zod";
import { apiAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { ApiError, clientIp, json, readJson, route } from "@/lib/server/http";
import { revokeUserSessions } from "@/lib/server/sessions";
import { countAdmins, deleteUser, findUserById, updateUser, type UserRow } from "@/lib/server/users";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    role: z.enum(["user", "admin"]).optional(),
    status: z.enum(["active", "suspended"]).optional(),
    limitMultiplier: z.number().min(0).max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");

function loadTarget(id: string): UserRow {
  const target = findUserById(id);
  if (!target) throw new ApiError(404, "not_found", "This user does not exist.");
  return target;
}

/** The site must never be left without an active administrator. */
function assertNotLastAdmin(target: UserRow): void {
  if (target.role === "admin" && target.status === "active" && countAdmins() <= 1) {
    throw new ApiError(409, "last_admin", "This is the only active administrator.");
  }
}

export const PATCH = route<Context>(async (request, { params }) => {
  const { user: admin } = await apiAdmin();
  const { id } = await params;
  const input = await readJson(request, patchSchema);
  const target = loadTarget(id);

  const changesAccess =
    (input.role !== undefined && input.role !== target.role) ||
    (input.status !== undefined && input.status !== target.status);
  if (changesAccess && target.id === admin.id) {
    throw new ApiError(400, "invalid_request", "You cannot change your own role or status.");
  }
  if ((input.role === "user" && target.role === "admin") || input.status === "suspended") {
    assertNotLastAdmin(target);
  }

  updateUser(target.id, {
    role: input.role,
    status: input.status,
    limit_multiplier: input.limitMultiplier,
  });
  if (input.status === "suspended" || (input.role && input.role !== target.role)) {
    revokeUserSessions(target.id);
  }
  audit({
    action: "admin.user_update",
    actor: admin,
    target: target.id,
    detail: { email: target.email, ...input },
    ip: clientIp(request),
  });
  return json({ ok: true });
});

export const DELETE = route<Context>(async (request, { params }) => {
  const { user: admin } = await apiAdmin();
  const { id } = await params;
  const target = loadTarget(id);
  if (target.id === admin.id) {
    throw new ApiError(400, "invalid_request", "Use the account settings to delete your own account.");
  }
  assertNotLastAdmin(target);
  deleteUser(target.id);
  audit({
    action: "admin.user_delete",
    actor: admin,
    target: target.id,
    detail: { email: target.email },
    ip: clientIp(request),
  });
  return json({ ok: true });
});
