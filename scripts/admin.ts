/**
 * Command-line account management, for the installer and for emergencies.
 *
 *   npm run admin -- create <email>    create an administrator (or promote an existing user)
 *   npm run admin -- reset  <email>    set a new password and sign the user out everywhere
 *
 * The password is read from the ADMIN_PASSWORD environment variable so it never
 * appears in the process list or the shell history. When the variable is not
 * set, a random password is generated and printed once.
 */
import { audit } from "@/lib/server/audit";
import { newToken } from "@/lib/server/ids";
import { hashPassword, passwordProblem } from "@/lib/server/password";
import { revokeUserSessions } from "@/lib/server/sessions";
import { createUser, findUserByEmail, updateUser } from "@/lib/server/users";
import { TERMS_VERSION } from "@/lib/shared/settings-schema";

async function main(): Promise<void> {
  const [command, rawEmail] = process.argv.slice(2);
  const email = (rawEmail ?? "").trim().toLowerCase();
  if ((command !== "create" && command !== "reset") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage: npm run admin -- <create|reset> <email>");
    process.exit(2);
  }

  let password = process.env.ADMIN_PASSWORD ?? "";
  const generated = password === "";
  if (generated) password = newToken().slice(0, 24);
  const problem = passwordProblem(password, email);
  if (problem) {
    console.error(`Password rejected: ${problem}`);
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);

  const existing = findUserByEmail(email);
  if (command === "reset") {
    if (!existing) {
      console.error(`No account found for ${email}.`);
      process.exit(1);
    }
    updateUser(existing.id, { password_hash: passwordHash });
    revokeUserSessions(existing.id);
    audit({ action: "cli.password_reset", target: existing.id, detail: { email } });
    console.log(`Password updated for ${email}.`);
  } else if (existing) {
    updateUser(existing.id, { role: "admin", status: "active", password_hash: passwordHash });
    revokeUserSessions(existing.id);
    audit({ action: "cli.admin_create", target: existing.id, detail: { email, promoted: true } });
    console.log(`${email} is now an administrator.`);
  } else {
    const user = createUser({
      email,
      name: "",
      passwordHash,
      role: "admin",
      termsVersion: TERMS_VERSION,
    });
    audit({ action: "cli.admin_create", target: user.id, detail: { email } });
    console.log(`Administrator ${email} created.`);
  }

  if (generated) console.log(`Generated password: ${password}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
