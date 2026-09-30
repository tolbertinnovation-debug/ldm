"use server";

import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { customers, users, verificationCodes } from "@/lib/db/schema";
import { fail, formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { clearPendingMfa, createSession, destroySession, getPendingMfa, setPendingMfa } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/permissions";
import { verifyTotp } from "@/lib/auth/totp";
import { decrypt, randomDigits, sha256 } from "@/lib/crypto";
import { normalizePhone } from "@/lib/phone";
import { rateLimit, resetRateLimit, retryMessage } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { sendTemplate } from "@/lib/messaging";
import { findOrCreateCustomer } from "@/lib/services/customers";
import { audit } from "@/lib/audit";

const LOCK_AFTER = 8;
const LOCK_MINUTES = 15;

function safeNext(next: unknown, fallback: string) {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}

function homeFor(role: string) {
  if (role === "DRIVER") return "/driver";
  return isStaffRole(role) ? "/admin" : "/account";
}

function landing(role: string, next: string) {
  // Customers must never be bounced into admin URLs and vice versa.
  if (next.startsWith("/admin") && !isStaffRole(role)) return "/account";
  if (next === "/login" || next === "/register") return homeFor(role);
  return next || homeFor(role);
}

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string | null = null;
  const res = await runAction(async () => {
    const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const next = safeNext(formData.get("next"), "");
    if (!identifier || !password) return fail("Enter your email or phone and password.", { identifier: !identifier ? "Required" : "", password: !password ? "Required" : "" });

    const ip = await clientIp();
    const byIp = await rateLimit(`login:ip:${ip}`, 30, 900);
    const byId = await rateLimit(`login:id:${identifier}`, 10, 900);
    if (!byIp.ok || !byId.ok) return fail(retryMessage(Math.max(byIp.retryAfterSeconds, byId.retryAfterSeconds)));

    const phone = identifier.includes("@") ? null : normalizePhone(identifier);
    const [user] = await db
      .select()
      .from(users)
      .where(phone ? eq(users.phone, phone) : eq(users.email, identifier))
      .limit(1);

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      return fail(`This account is temporarily locked after too many attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`);
    }
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid || !user.active) {
      if (user) {
        const failed = user.failedLogins + 1;
        await db
          .update(users)
          .set({ failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
          .where(eq(users.id, user.id));
        if (isStaffRole(user.role)) await audit({ actor: null, action: "auth.failed", entityType: "user", entityId: user.id, summary: `Failed sign-in for ${user.email ?? user.phone}` });
      }
      return fail(user && !user.active ? "This account has been deactivated." : "Incorrect email/phone or password.");
    }
    await resetRateLimit(`login:id:${identifier}`);

    if (user.totpEnabled) {
      await setPendingMfa(user.id, next);
      destination = "/login/2fa";
      return ok();
    }
    await createSession(user.id, user.role);
    if (isStaffRole(user.role)) await audit({ actor: user, action: "auth.login", entityType: "user", entityId: user.id, summary: `${user.name} signed in` });
    destination = landing(user.role, next);
    return ok();
  });
  if (destination) redirect(destination);
  return res;
}

export async function verifyTwoFactorAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string | null = null;
  const res = await runAction(async () => {
    const pending = await getPendingMfa();
    if (!pending) {
      destination = "/login";
      return ok();
    }
    const limited = await rateLimit(`mfa:${pending.uid}`, 6, 600);
    if (!limited.ok) return fail(retryMessage(limited.retryAfterSeconds));
    const code = String(formData.get("code") ?? "");
    const [user] = await db.select().from(users).where(eq(users.id, pending.uid));
    if (!user?.totpSecret || !user.active) return fail("Two-factor authentication is not set up for this account.");
    if (!verifyTotp(decrypt(user.totpSecret), code)) return fail("That code is not correct. Check your authenticator app.", { code: "Invalid code" });
    await clearPendingMfa();
    await createSession(user.id, user.role);
    await audit({ actor: user, action: "auth.login", entityType: "user", entityId: user.id, summary: `${user.name} signed in (2FA)` });
    destination = landing(user.role, pending.next);
    return ok();
  });
  if (destination) redirect(destination);
  return res;
}

export async function requestCodeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string | null = null;
  const res = await runAction(async () => {
    const phone = normalizePhone(String(formData.get("phone") ?? ""));
    const next = safeNext(formData.get("next"), "");
    if (!phone) return fail("Enter a valid phone number.", { phone: "Invalid phone number" });
    const ip = await clientIp();
    const byTarget = await rateLimit(`otp:t:${phone}`, 4, 900);
    const byIp = await rateLimit(`otp:ip:${ip}`, 12, 3600);
    if (!byTarget.ok || !byIp.ok) return fail(retryMessage(Math.max(byTarget.retryAfterSeconds, byIp.retryAfterSeconds)));

    const [existing] = await db.select({ role: users.role }).from(users).where(eq(users.phone, phone)).limit(1);
    if (existing && isStaffRole(existing.role)) return fail("Staff accounts must sign in with a password.");

    const code = randomDigits(6);
    await db.insert(verificationCodes).values({ target: phone, purpose: "LOGIN", codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
    const [customer] = await db.select({ preferredChannel: customers.preferredChannel }).from(customers).where(eq(customers.phone, phone)).limit(1);
    await sendTemplate("auth.otp", { phone, preferredChannel: customer?.preferredChannel === "SMS" ? "SMS" : "WHATSAPP" }, { code });
    destination = `/login/verify?phone=${encodeURIComponent(phone)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
    return ok();
  });
  if (destination) redirect(destination);
  return res;
}

export async function verifyCodeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string | null = null;
  const res = await runAction(async () => {
    const phone = normalizePhone(String(formData.get("phone") ?? ""));
    const code = String(formData.get("code") ?? "").replace(/\D/g, "");
    const next = safeNext(formData.get("next"), "/account");
    if (!phone) return fail("Your session expired. Please request a new code.");
    if (code.length !== 6) return fail("Enter the 6-digit code.", { code: "Enter 6 digits" });

    const [record] = await db
      .select()
      .from(verificationCodes)
      .where(and(eq(verificationCodes.target, phone), eq(verificationCodes.purpose, "LOGIN"), isNull(verificationCodes.consumedAt), gt(verificationCodes.expiresAt, new Date())))
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);
    if (!record) return fail("This code has expired. Please request a new one.");
    if (record.attempts >= 5) return fail("Too many wrong attempts. Please request a new code.");
    if (record.codeHash !== sha256(`${phone}:${code}`)) {
      await db.update(verificationCodes).set({ attempts: sql`${verificationCodes.attempts} + 1` }).where(eq(verificationCodes.id, record.id));
      return fail("That code is not correct.", { code: "Incorrect code" });
    }
    await db.update(verificationCodes).set({ consumedAt: new Date() }).where(eq(verificationCodes.id, record.id));

    let [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (user && isStaffRole(user.role)) return fail("Staff accounts must sign in with a password.");
    if (user && !user.active) return fail("This account has been deactivated.");
    if (!user) {
      const [c] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
      [user] = await db.insert(users).values({ name: c?.name && c.name !== phone ? c.name : "Customer", phone, email: null, role: "CUSTOMER" }).returning();
    }
    await db.transaction(async (tx) => {
      await findOrCreateCustomer(tx, { name: user!.name, phone, userId: user!.id, source: "Website" });
    });
    await createSession(user!.id, user!.role);
    destination = landing(user!.role, next);
    return ok();
  });
  if (destination) redirect(destination);
  return res;
}

const registerSchema = z.object({
  name: zf.requiredText("Your name", 120),
  phone: z.string().trim().refine((v) => !!normalizePhone(v), "Enter a valid phone number"),
  email: zf.email(),
  password: z.string().max(200),
  marketing: zf.checkbox(),
});

export async function registerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string | null = null;
  const res = await runAction(async () => {
    const limited = await rateLimit(`register:${await clientIp()}`, 10, 3600);
    if (!limited.ok) return fail(retryMessage(limited.retryAfterSeconds));
    const data = registerSchema.parse(formObject(formData));
    const problem = passwordProblems(data.password);
    if (problem) throw new UserError(problem, { password: problem });
    const phone = normalizePhone(data.phone)!;
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (taken) throw new UserError("An account with this phone already exists. Sign in instead.", { phone: "Already registered" });
    if (data.email) {
      const [emailTaken] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
      if (emailTaken) throw new UserError("An account with this email already exists.", { email: "Already registered" });
    }
    const passwordHash = await hashPassword(data.password);
    const user = await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({ name: data.name, phone, email: data.email, passwordHash, role: "CUSTOMER" }).returning();
      const c = await findOrCreateCustomer(tx, { name: data.name, phone, email: data.email, userId: u!.id, source: "Website sign-up" });
      if (data.marketing) await tx.update(customers).set({ marketingWhatsapp: true, marketingSms: true, marketingEmail: !!data.email }).where(eq(customers.id, c.id));
      return u!;
    });
    await createSession(user.id, user.role);
    destination = safeNext(formData.get("next"), "/account");
    return ok();
  });
  if (destination) redirect(destination);
  return res;
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
