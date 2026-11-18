import { z } from "zod";
import { emailSchema } from "@/lib/server/account";
import { apiAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { ApiError, clientIp, json, readJson, route } from "@/lib/server/http";
import { newToken } from "@/lib/server/ids";
import { hashPassword } from "@/lib/server/password";
import { createUser, findUserByEmail } from "@/lib/server/users";

const createSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(60).default(""),
  role: z.enum(["user", "admin"]).default("user"),
});

/** Creates an account with a one-time temporary password (shown once). */
export const POST = route(async (request) => {
  const { user: admin } = await apiAdmin();
  const input = await readJson(request, createSchema);
  if (findUserByEmail(input.email)) {
    throw new ApiError(409, "email_taken", "An account with this email address already exists.");
  }
  const temporaryPassword = newToken().slice(0, 20);
  const created = createUser({
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(temporaryPassword),
  });
  audit({
    action: "admin.user_create",
    actor: admin,
    target: created.id,
    detail: { email: created.email, role: created.role },
    ip: clientIp(request),
  });
  return json({ id: created.id, temporaryPassword }, { status: 201 });
});
