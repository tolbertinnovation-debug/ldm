"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission, destroyAllSessionsFor } from "@/lib/auth/session";
import { canAssignRole, STAFF_ROLES } from "@/lib/auth/permissions";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";

export async function createStaffAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("staff:manage");
    const d = z.object({ name: zf.requiredText("Name", 120), email: zf.email(), phone: zf.optionalText(30), role: z.enum(STAFF_ROLES), password: z.string().max(200) }).parse(formObject(formData));
    if (!d.email) throw new UserError("Staff need an email to sign in.", { email: "Required" });
    if (!canAssignRole(actor.role, d.role)) throw new UserError("You cannot create an account with that role.");
    const problem = passwordProblems(d.password);
    if (problem) throw new UserError(problem, { password: problem });
    const phone = d.phone ? normalizePhone(d.phone) : null;
    const [clash] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, d.email));
    if (clash) throw new UserError("A user with this email already exists.", { email: "Already exists" });
    if (phone) {
      const [pClash] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
      if (pClash) throw new UserError("A user with this phone already exists.", { phone: "Already exists" });
    }
    const [u] = await db.insert(users).values({ name: d.name, email: d.email, phone, role: d.role, passwordHash: await hashPassword(d.password) }).returning();
    await audit({ actor, action: "staff.create", entityType: "user", entityId: u!.id, summary: `Created ${d.role} account for ${d.name}` });
    revalidatePath("/admin/staff");
    return ok(`${d.name} can now sign in`);
  });
}

export async function updateStaffAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("staff:manage");
    const d = z.object({ id: z.uuid(), role: z.enum([...STAFF_ROLES, "CUSTOMER"]), active: zf.checkbox(), newPassword: zf.optionalText(200) }).parse(formObject(formData));
    const [target] = await db.select().from(users).where(eq(users.id, d.id));
    if (!target) throw new UserError("User not found.");
    if (target.id === actor.id && (d.role !== target.role || !d.active)) throw new UserError("You cannot change your own role or deactivate yourself.");
    if (!canAssignRole(actor.role, target.role) || !canAssignRole(actor.role, d.role)) throw new UserError("You cannot manage users with that role.");
    if (target.role === "OWNER" && (d.role !== "OWNER" || !d.active)) {
      const others = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "OWNER"), eq(users.active, true), ne(users.id, target.id)));
      if (!others.length) throw new UserError("There must always be at least one active owner.");
    }
    const patch: Partial<typeof users.$inferInsert> = { role: d.role, active: d.active };
    if (d.newPassword) {
      const problem = passwordProblems(d.newPassword);
      if (problem) throw new UserError(problem, { newPassword: problem });
      patch.passwordHash = await hashPassword(d.newPassword);
      patch.failedLogins = 0;
      patch.lockedUntil = null;
    }
    await db.update(users).set(patch).where(eq(users.id, d.id));
    if (!d.active || d.newPassword || d.role !== target.role) await destroyAllSessionsFor(d.id);
    await audit({ actor, action: "staff.update", entityType: "user", entityId: d.id, summary: `${target.name}: role ${target.role}→${d.role}, ${d.active ? "active" : "deactivated"}${d.newPassword ? ", password reset" : ""}` });
    revalidatePath("/admin/staff");
    return ok("Saved");
  });
}

export async function resetTwoFactorAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("staff:manage");
    const id = z.uuid().parse(formData.get("id"));
    const [target] = await db.select().from(users).where(eq(users.id, id));
    if (!target || !canAssignRole(actor.role, target.role)) throw new UserError("Not allowed.");
    await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, id));
    await destroyAllSessionsFor(id);
    await audit({ actor, action: "staff.2fa_reset", entityType: "user", entityId: id, summary: `Reset 2FA for ${target.name}` });
    revalidatePath("/admin/staff");
    return ok("Two-factor reset — they can set it up again");
  });
}
