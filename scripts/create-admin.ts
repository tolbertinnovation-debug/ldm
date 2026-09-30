/**
 * Creates (or resets) an owner account.
 *   npm run create-admin -- --email you@example.org --name "Your Name" --password "a-strong-password"
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../src/lib/db";
import { users } from "../src/lib/db/schema";
import { hashPassword, passwordProblems } from "../src/lib/auth/password";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name") ?? "Owner";
  const password = arg("password");
  if (!email || !password) throw new Error("Usage: npm run create-admin -- --email you@example.org --name \"Name\" --password \"...\"");
  const problem = passwordProblems(password);
  if (problem) throw new Error(problem);
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db.update(users).set({ passwordHash, role: "OWNER", active: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, existing.id));
    console.log(`Updated ${email} to OWNER with the new password.`);
  } else {
    await db.insert(users).values({ email, name, passwordHash, role: "OWNER" });
    console.log(`Created owner ${email}.`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
