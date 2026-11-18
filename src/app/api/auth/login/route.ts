import { authenticate, loginSchema } from "@/lib/server/account";
import { startSession } from "@/lib/server/auth";
import { clientIp, json, readJson, route } from "@/lib/server/http";
import { toSessionUser } from "@/lib/server/users";

export const POST = route(async (request) => {
  const input = await readJson(request, loginSchema);
  const user = await authenticate(input, clientIp(request));
  await startSession(user, request);
  return json({ user: toSessionUser(user) });
});
