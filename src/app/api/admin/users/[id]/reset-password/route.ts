import { apiAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { ApiError, clientIp, json, route } from "@/lib/server/http";
import { newToken } from "@/lib/server/ids";
import { hashPassword } from "@/lib/server/password";
import { revokeUserSessions } from "@/lib/server/sessions";
import { findUserById, updateUser } from "@/lib/server/users";

type Context = { params: Promise<{ id: string }> };

/** Sets a random temporary password and signs the user out everywhere. */
export const POST = route<Context>(async (request, { params }) => {
  const { user: admin } = await apiAdmin();
  const { id } = await params;
  const target = findUserById(id);
  if (!target) throw new ApiError(404, "not_found", "This user does not exist.");

  const temporaryPassword = newToken().slice(0, 20);
  updateUser(target.id, { password_hash: await hashPassword(temporaryPassword) });
  revokeUserSessions(target.id);
  audit({
    action: "admin.user_password_reset",
    actor: admin,
    target: target.id,
    detail: { email: target.email },
    ip: clientIp(request),
  });
  return json({ temporaryPassword });
});
