"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { ok, runAction, UserError, type ActionState } from "@/lib/actions";
import { AuthError, getCurrentUser, SESSION_COOKIE } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/permissions";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";

async function staffUser() {
  const u = await getCurrentUser();
  if (!u || !isStaffRole(u.role)) throw new AuthError();
  return u;
}

export async function startTwoFactorAction(): Promise<ActionState> {
  return runAction(async () => {
    const u = await staffUser();
    if (u.totpEnabled) throw new UserError("Two-factor is already on.");
    await db.update(users).set({ totpSecret: encrypt(generateTotpSecret()) }).where(eq(users.id, u.id));
    revalidatePath("/admin/security");
    return ok();
  });
}

export async function confirmTwoFactorAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const u = await staffUser();
    const [row] = await db.select({ secret: users.totpSecret }).from(users).where(eq(users.id, u.id));
    if (!row?.secret) throw new UserError("Start the setup first.");
    if (!verifyTotp(decrypt(row.secret), String(formData.get("code") ?? ""))) throw new UserError("That code didn't match. Check the time on your phone and try again.", { code: "Invalid code" });
    await db.update(users).set({ totpEnabled: true }).where(eq(users.id, u.id));
    await audit({ actor: u, action: "auth.2fa_enabled", entityType: "user", entityId: u.id, summary: `${u.name} turned on 2FA` });
    revalidatePath("/admin/security");
    return ok("Two-factor authentication is on");
  });
}

export async function disableTwoFactorAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const u = await staffUser();
    const [row] = await db.select({ secret: users.totpSecret }).from(users).where(eq(users.id, u.id));
    if (!row?.secret || !verifyTotp(decrypt(row.secret), String(formData.get("code") ?? ""))) throw new UserError("Enter a valid code from your app to turn 2FA off.", { code: "Invalid code" });
    await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, u.id));
    await audit({ actor: u, action: "auth.2fa_disabled", entityType: "user", entityId: u.id, summary: `${u.name} turned off 2FA` });
    revalidatePath("/admin/security");
    return ok("Two-factor authentication is off");
  });
}

export async function changeStaffPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const u = await staffUser();
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("password") ?? "");
    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, u.id));
    if (!(await verifyPassword(current, row?.hash))) throw new UserError("Current password is incorrect.", { current: "Incorrect" });
    const problem = passwordProblems(next);
    if (problem) throw new UserError(problem, { password: problem });
    await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, u.id));
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, sha256(token))));
    await audit({ actor: u, action: "auth.password_changed", entityType: "user", entityId: u.id, summary: `${u.name} changed password` });
    return ok("Password changed. Other devices were signed out.");
  });
}

export async function signOutOthersAction(): Promise<ActionState> {
  return runAction(async () => {
    const u = await staffUser();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await db.delete(sessions).where(and(eq(sessions.userId, u.id), ne(sessions.id, sha256(token))));
    revalidatePath("/admin/security");
    return ok("Signed out of all other devices");
  });
}
