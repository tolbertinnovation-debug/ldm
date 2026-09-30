import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { randomToken, sha256, signToken, verifyToken } from "@/lib/crypto";
import { clientIp, userAgent } from "@/lib/request";
import { can, isStaffRole, type Permission } from "./permissions";

const secureCookies = process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").startsWith("https://");
export const SESSION_COOKIE = secureCookies ? "__Host-reap_session" : "reap_session";
const MFA_COOKIE = secureCookies ? "__Host-reap_mfa" : "reap_mfa";

const DAY = 24 * 60 * 60 * 1000;
const STAFF_TTL = 7 * DAY;
const CUSTOMER_TTL = 30 * DAY;
const TOUCH_INTERVAL = 10 * 60 * 1000;

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: (typeof users.$inferSelect)["role"];
  totpEnabled: boolean;
};

export class AuthError extends Error {
  constructor(message = "You are not allowed to do that.") {
    super(message);
    this.name = "AuthError";
  }
}

function ttlFor(role: string) {
  return isStaffRole(role) ? STAFF_TTL : CUSTOMER_TTL;
}

export async function createSession(userId: string, role: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ttlFor(role));
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    ip: await clientIp(),
    userAgent: await userAgent(),
  });
  await db.update(users).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  // Opportunistic cleanup of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessionsFor(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Current session user, memoised per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      active: users.active,
      totpEnabled: users.totpEnabled,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.active) return null;

  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL) {
    // Sliding expiry; cookie keeps its original expiry (cannot set cookies during render).
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + ttlFor(row.role)) })
      .where(eq(sessions.id, id));
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    totpEnabled: row.totpEnabled,
  };
});

export async function requireUser(next = "/account") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Guard for admin pages. Redirects to login or the "no access" page. */
export async function requireStaff(permission?: Permission, next = "/admin") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!isStaffRole(user.role)) redirect("/account");
  if (permission && !can(user.role, permission)) {
    if (user.role === "DRIVER") redirect("/driver");
    redirect(`/admin/no-access?need=${encodeURIComponent(permission)}`);
  }
  return user;
}

/** Guard for server actions / route handlers. Throws instead of redirecting. */
export async function assertPermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Please sign in again.");
  if (!can(user.role, permission)) throw new AuthError();
  return user;
}

// ---------------------------------------------------------------------------
// Two-step sign-in for staff with 2FA enabled
// ---------------------------------------------------------------------------

export async function setPendingMfa(userId: string, next: string) {
  const jar = await cookies();
  jar.set(MFA_COOKIE, signToken({ uid: userId, next }, 300, "mfa"), {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
}

export async function getPendingMfa() {
  const jar = await cookies();
  return verifyToken<{ uid: string; next: string }>(jar.get(MFA_COOKIE)?.value, "mfa");
}

export async function clearPendingMfa() {
  const jar = await cookies();
  jar.delete(MFA_COOKIE);
}

export async function countActiveSessions(userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())));
  return row?.n ?? 0;
}
