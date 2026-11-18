import { hashPassword } from "@/lib/server/password";
import { createUser, type UserRow } from "@/lib/server/users";

let counter = 0;

export async function makeUser(overrides: { role?: "user" | "admin"; password?: string } = {}): Promise<UserRow> {
  counter += 1;
  return createUser({
    email: `person${counter}@example.com`,
    name: `Person ${counter}`,
    passwordHash: await hashPassword(overrides.password ?? "correct horse battery"),
    role: overrides.role,
  });
}
