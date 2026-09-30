"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { customerAddresses, customers, orderItems, orders, users } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { AuthError, getCurrentUser } from "@/lib/auth/session";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { normalizePhone } from "@/lib/phone";
import { addToCart } from "@/lib/services/cart";

async function currentCustomer() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Please sign in again.");
  const [customer] = await db.select().from(customers).where(eq(customers.userId, user.id)).limit(1);
  return { user, customer: customer ?? null };
}

export async function updateProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user, customer } = await currentCustomer();
    const data = z
      .object({
        name: zf.requiredText("Name", 120),
        email: zf.email(),
        preferredChannel: z.enum(["WHATSAPP", "SMS", "EMAIL"]),
        marketingWhatsapp: zf.checkbox(),
        marketingSms: zf.checkbox(),
        marketingEmail: zf.checkbox(),
      })
      .parse(formObject(formData));
    if (data.email && data.email !== user.email) {
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
      if (taken && taken.id !== user.id) throw new UserError("That email is used by another account.", { email: "Already in use" });
    }
    await db.update(users).set({ name: data.name, email: data.email }).where(eq(users.id, user.id));
    if (customer) {
      await db
        .update(customers)
        .set({ name: data.name, email: data.email ?? customer.email, preferredChannel: data.preferredChannel, marketingWhatsapp: data.marketingWhatsapp, marketingSms: data.marketingSms, marketingEmail: data.marketingEmail })
        .where(eq(customers.id, customer.id));
    }
    revalidatePath("/account");
    return ok("Profile saved");
  });
}

export async function changePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { user } = await currentCustomer();
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("password") ?? "");
    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
    if (row?.hash && !(await verifyPassword(current, row.hash))) throw new UserError("Current password is incorrect.", { current: "Incorrect" });
    const problem = passwordProblems(next);
    if (problem) throw new UserError(problem, { password: problem });
    await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
    return ok("Password updated");
  });
}

export async function addAddressAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { customer } = await currentCustomer();
    if (!customer) throw new UserError("Place an order first to save addresses.");
    const data = z
      .object({
        label: zf.optionalText(40),
        line1: zf.requiredText("Street / house", 200),
        area: zf.optionalText(120),
        landmark: zf.optionalText(200),
        zoneId: zf.optionalUuid(),
        phone: zf.optionalText(30),
      })
      .parse(formObject(formData));
    await db.transaction(async (tx) => {
      await tx.update(customerAddresses).set({ isDefault: false }).where(eq(customerAddresses.customerId, customer.id));
      await tx.insert(customerAddresses).values({ customerId: customer.id, label: data.label, line1: data.line1, area: data.area, landmark: data.landmark, zoneId: data.zoneId, phone: normalizePhone(data.phone), city: "Monrovia", isDefault: true });
    });
    revalidatePath("/account");
    return ok("Address saved");
  });
}

export async function deleteAddressAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { customer } = await currentCustomer();
    if (!customer) return ok();
    const id = z.uuid().parse(formData.get("id"));
    await db.delete(customerAddresses).where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customer.id)));
    revalidatePath("/account");
    return ok("Address removed");
  });
}

export async function reorderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let go = false;
  const res = await runAction(async () => {
    const { customer } = await currentCustomer();
    const orderId = z.uuid().parse(formData.get("orderId"));
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order || !customer || order.customerId !== customer.id) throw new UserError("Order not found.");
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let added = 0;
    for (const it of items) {
      if (!it.productId) continue;
      try {
        await addToCart(it.productId, it.quantity, it.options.map((o) => ({ group: o.group, choice: o.choice })));
        added++;
      } catch {
        // skip items that are no longer available
      }
    }
    if (!added) throw new UserError("None of these items are available right now.");
    go = true;
    return ok();
  });
  if (go) redirect("/cart");
  return res;
}
