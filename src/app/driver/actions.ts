"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { deliveries, orderEvents, orders } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { updateOrderStatus } from "@/lib/services/orders";
import { recordPayment } from "@/lib/services/payments";

async function ownDelivery(orderId: string) {
  const actor = await assertPermission("deliveries:drive").catch(async () => assertPermission("deliveries:manage"));
  const [d] = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
  if (!d) throw new UserError("Delivery not found.");
  if (d.driverId !== actor.id && !can(actor.role, "deliveries:manage")) throw new UserError("This delivery is assigned to someone else.");
  return { actor, d };
}

export async function driverUpdateAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const data = z
      .object({ orderId: z.uuid(), step: z.enum(["PICKED_UP", "DELIVERED", "FAILED"]), recipientName: zf.optionalText(120), cashCollected: zf.optionalText(20), note: zf.optionalText(500), paymentMethod: z.enum(["CASH", "ORANGE_MONEY", "MTN_MOMO"]).default("CASH") })
      .parse(formObject(formData));
    const { actor } = await ownDelivery(data.orderId);
    const [order] = await db.select().from(orders).where(eq(orders.id, data.orderId));
    if (!order) throw new UserError("Order not found.");

    if (data.step === "PICKED_UP") {
      await db.update(deliveries).set({ status: "PICKED_UP", pickedUpAt: new Date() }).where(eq(deliveries.orderId, data.orderId));
      if (order.status !== "OUT_FOR_DELIVERY") await updateOrderStatus(data.orderId, "OUT_FOR_DELIVERY", actor);
      await db.update(deliveries).set({ status: "IN_TRANSIT" }).where(eq(deliveries.orderId, data.orderId));
      revalidatePath("/driver");
      return ok("On the way — customer notified");
    }
    if (data.step === "FAILED") {
      if (!data.note) throw new UserError("Say why the delivery failed.", { note: "Required" });
      await db.update(deliveries).set({ status: "FAILED", failedReason: data.note }).where(eq(deliveries.orderId, data.orderId));
      if (order.status === "OUT_FOR_DELIVERY") await updateOrderStatus(data.orderId, "READY", actor, { note: `Delivery attempt failed: ${data.note}`, notify: false });
      await db.insert(orderEvents).values({ orderId: data.orderId, type: "DELIVERY", message: `Delivery failed: ${data.note}`, actorId: actor.id });
      await audit({ actor, action: "delivery.failed", entityType: "order", entityId: data.orderId, summary: `${order.number} delivery failed: ${data.note}` });
      revalidatePath("/driver");
      return ok("Marked as failed — the office will follow up");
    }
    // DELIVERED
    const cash = data.cashCollected ? parseMoney(data.cashCollected) : 0;
    if (cash === null || cash < 0) throw new UserError("Enter the amount collected.", { cashCollected: "Invalid amount" });
    if (cash > 0) await recordPayment({ orderId: data.orderId, amount: cash, method: data.paymentMethod, actor, note: "Collected on delivery" });
    await db
      .update(deliveries)
      .set({ status: "DELIVERED", deliveredAt: new Date(), recipientName: data.recipientName, proofNote: data.note, codCollected: cash })
      .where(eq(deliveries.orderId, data.orderId));
    await updateOrderStatus(data.orderId, "COMPLETED", actor, { note: data.recipientName ? `Received by ${data.recipientName}` : undefined });
    await audit({ actor, action: "delivery.done", entityType: "order", entityId: data.orderId, summary: `${order.number} delivered${cash ? `, collected ${data.cashCollected}` : ""}` });
    revalidatePath("/driver");
    return ok("Delivered! Great work.");
  });
}

export async function claimDeliveryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("deliveries:drive");
    const orderId = z.uuid().parse(formData.get("orderId"));
    const updated = await db
      .update(deliveries)
      .set({ driverId: actor.id, status: "ASSIGNED", assignedAt: new Date() })
      .where(and(eq(deliveries.orderId, orderId), eq(deliveries.status, "UNASSIGNED")))
      .returning({ id: deliveries.id });
    if (!updated.length) throw new UserError("Someone already took this delivery.");
    await db.insert(orderEvents).values({ orderId, type: "DELIVERY", message: `${actor.name} took the delivery`, actorId: actor.id });
    revalidatePath("/driver");
    return ok("Delivery added to your list");
  });
}
