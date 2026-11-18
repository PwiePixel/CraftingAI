import { apiUser } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";
import { revokeUserSessions } from "@/lib/server/sessions";

/** Signs the user out everywhere except on the current device. */
export const DELETE = route(async () => {
  const { user, session } = await apiUser();
  return json({ revokedSessions: revokeUserSessions(user.id, session.id) });
});
