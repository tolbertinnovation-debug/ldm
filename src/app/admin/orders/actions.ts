"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { deliveries, orderEvents, orders, users } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/constants";
import { addOrderNote, createOrder, setItemQuantity, updateOrderStatus } from "@/lib/services/orders";
import { recordPayment, settlePayment } from "@/lib/services/payments";
import { createInvoiceFromOrder } from "@/lib/services/invoices";
import { queueMessage } from "@/lib/messaging";
import { kickJobs } from "@/lib/jobs/queue";

function refresh(orderId?: string) {
  revalidatePath("/admin/orders");
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
}

export async function setStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("orders:manage");
    const data = z
      .object({ orderId: z.uuid(), status: z.enum(ORDER_STATUSES), reason: zf.optionalText(300), notify: zf.checkbox() })
      .parse({ ...formObject(formData), notify: formData.get("notify") ?? "on" });
    if (data.status === "CANCELLED" && !data.reason) throw new UserError("Give a reason for cancelling.", { reason: "Required" });
    const o = await updateOrderStatus(data.orderId, data.status, actor, { reason: data.reason, notify: data.notify });
    await audit({ actor, action: "order.status", entityType: "order", entityId: o.id, summary: `${o.number} → ${data.status}${data.reason ? ` (${data.reason})` : ""}` });
    refresh(o.id);
    return ok(`Order ${o.number} updated`);
  });
}

export async function recordPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("payments:manage");
    const data = z
      .object({
        orderId: zf.optionalUuid(),
        invoiceId: zf.optionalUuid(),
        amount: z.string(),
        method: z.enum(PAYMENT_METHODS),
        kind: z.enum(["PAYMENT", "REFUND"]).default("PAYMENT"),
        reference: zf.optionalText(80),
        note: zf.optionalText(500),
      })
      .parse(formObject(formData));
    const amount = parseMoney(data.amount);
    if (!amount || amount <= 0) throw new UserError("Enter a valid amount.", { amount: "Invalid amount" });
    const p = await recordPayment({ orderId: data.orderId, invoiceId: data.invoiceId, amount, method: data.method, kind: data.kind, providerRef: data.reference, note: data.note, actor });
    await audit({ actor, action: data.kind === "REFUND" ? "payment.refund" : "payment.record", entityType: "payment", entityId: p.id, summary: `${data.kind === "REFUND" ? "Refund" : "Payment"} ${p.reference} ${data.amount} (${data.method})`, data: { orderId: data.orderId, invoiceId: data.invoiceId } });
    refresh(data.orderId ?? undefined);
    revalidatePath("/admin/payments");
    if (data.invoiceId) revalidatePath(`/admin/invoices/${data.invoiceId}`);
    return ok(data.kind === "REFUND" ? "Refund recorded" : "Payment recorded");
  });
}

export async function settlePaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("payments:manage");
    const paymentId = z.uuid().parse(formData.get("paymentId"));
    const outcome = z.enum(["SUCCEEDED", "FAILED"]).parse(formData.get("outcome"));
    const p = await settlePayment(paymentId, outcome, actor);
    if (p) await audit({ actor, action: "payment.settle", entityType: "payment", entityId: paymentId, summary: `Payment ${p.reference} marked ${outcome.toLowerCase()}` });
    refresh(p?.orderId ?? undefined);
    revalidatePath("/admin/payments");
    return ok(outcome === "SUCCEEDED" ? "Payment confirmed" : "Payment rejected");
  });
}

export async function setWeightAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("orders:manage");
    const data = z.object({ orderId: z.uuid(), itemId: z.uuid(), quantity: z.coerce.number().positive("Enter the weighed quantity") }).parse(formObject(formData));
    const o = await setItemQuantity(data.orderId, data.itemId, data.quantity, actor);
    await audit({ actor, action: "order.weight", entityType: "order", entityId: o.id, summary: `${o.number}: item quantity set to ${data.quantity}` });
    refresh(o.id);
    return ok("Quantity updated and order re-totalled");
  });
}

export async function assignDriverAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("deliveries:manage");
    const data = z.object({ orderId: z.uuid(), driverId: zf.optionalUuid() }).parse(formObject(formData));
    let driverName = "nobody";
    if (data.driverId) {
      const [driver] = await db.select().from(users).where(eq(users.id, data.driverId));
      if (!driver || driver.role !== "DRIVER" || !driver.active) throw new UserError("Choose an active driver.");
      driverName = driver.name;
    }
    await db
      .update(deliveries)
      .set({ driverId: data.driverId, status: data.driverId ? "ASSIGNED" : "UNASSIGNED", assignedAt: data.driverId ? new Date() : null })
      .where(eq(deliveries.orderId, data.orderId));
    await db.insert(orderEvents).values({ orderId: data.orderId, type: "DELIVERY", message: `Delivery assigned to ${driverName}`, actorId: actor.id });
    await audit({ actor, action: "delivery.assign", entityType: "order", entityId: data.orderId, summary: `Driver set to ${driverName}` });
    refresh(data.orderId);
    revalidatePath("/admin/deliveries");
    return ok(`Assigned to ${driverName}`);
  });
}

export async function addNoteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("orders:view");
    const data = z.object({ orderId: z.uuid(), message: zf.requiredText("Note", 2000), isPublic: zf.checkbox() }).parse(formObject(formData));
    await addOrderNote(data.orderId, data.message, actor, data.isPublic);
    refresh(data.orderId);
    return ok("Note added");
  });
}

export async function updateInternalNoteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertPermission("orders:manage");
    const data = z.object({ orderId: z.uuid(), internalNote: zf.optionalText(4000), scheduledDate: zf.optionalDate(), timeSlot: zf.optionalText(80) }).parse(formObject(formData));
    await db.update(orders).set({ internalNote: data.internalNote, scheduledDate: data.scheduledDate, timeSlot: data.timeSlot }).where(eq(orders.id, data.orderId));
    refresh(data.orderId);
    return ok("Saved");
  });
}

export async function createInvoiceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string | null = null;
  const res = await runAction(async () => {
    const actor = await assertPermission("invoices:manage");
    const orderId = z.uuid().parse(formData.get("orderId"));
    id = await createInvoiceFromOrder(orderId, actor.id);
    await audit({ actor, action: "invoice.create", entityType: "invoice", entityId: id, summary: `Invoice created from order` });
    return ok();
  });
  if (id) redirect(`/admin/invoices/${id}`);
  return res;
}

export async function messageCustomerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("messages:send");
    const data = z
      .object({ customerId: zf.optionalUuid(), orderId: zf.optionalUuid(), channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]), to: zf.requiredText("Recipient", 200), subject: zf.optionalText(200), body: zf.requiredText("Message", 2000) })
      .parse(formObject(formData));
    const id = await queueMessage({ channel: data.channel, to: data.to, subject: data.subject, body: data.body, customerId: data.customerId, orderId: data.orderId, sentById: actor.id });
    if (!id) throw new UserError("That recipient address is not valid.");
    if (data.orderId) await db.insert(orderEvents).values({ orderId: data.orderId, type: "MESSAGE", message: `${data.channel} sent: ${data.body.slice(0, 140)}`, actorId: actor.id });
    kickJobs();
    if (data.orderId) refresh(data.orderId);
    if (data.customerId) revalidatePath(`/admin/customers/${data.customerId}`);
    revalidatePath("/admin/messages");
    return ok("Message queued");
  });
}

// ---------------------------------------------------------------------------
// POS / manual order entry
// ---------------------------------------------------------------------------

const posSchema = z.object({
  customerId: zf.optionalUuid(),
  name: zf.requiredText("Customer name", 120),
  phone: zf.requiredText("Phone", 30),
  email: zf.email(),
  channel: z.enum(["PHONE", "WHATSAPP", "WALK_IN", "SOCIAL", "WHOLESALE", "OTHER", "WEB"]),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP"]),
  deliveryZoneId: zf.optionalUuid(),
  line1: zf.optionalText(200),
  area: zf.optionalText(120),
  landmark: zf.optionalText(200),
  pickupLocationId: zf.optionalUuid(),
  scheduledDate: zf.optionalDate(),
  timeSlot: zf.optionalText(80),
  deliveryFee: zf.optionalText(20),
  promoCode: zf.optionalText(40),
  internalNote: zf.optionalText(2000),
  customerNote: zf.optionalText(2000),
  items: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountPaid: zf.optionalText(20),
  paymentRef: zf.optionalText(80),
  status: z.enum(["PENDING", "CONFIRMED", "COMPLETED"]),
});

export async function createPosOrderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string | null = null;
  const res = await runAction(async () => {
    const actor = await assertPermission("pos:use");
    const data = posSchema.parse(formObject(formData));
    const items = z
      .array(z.object({ productId: z.uuid(), quantity: z.number().positive(), options: z.array(z.object({ group: z.string(), choice: z.string() })).default([]) }))
      .min(1, "Add at least one item")
      .parse(JSON.parse(data.items || "[]"));
    const deliveryFee = data.deliveryFee ? parseMoney(data.deliveryFee) : null;
    const order = await createOrder({
      items,
      customer: { name: data.name, phone: data.phone, email: data.email, customerId: data.customerId },
      fulfillmentType: data.fulfillmentType,
      deliveryZoneId: data.deliveryZoneId,
      address: data.fulfillmentType === "DELIVERY" ? { recipientName: data.name, phone: data.phone, line1: data.line1 ?? "To be confirmed", area: data.area, landmark: data.landmark, city: "Monrovia" } : null,
      pickupLocationId: data.pickupLocationId,
      scheduledDate: data.scheduledDate,
      timeSlot: data.timeSlot,
      paymentMethod: data.paymentMethod,
      promoCode: data.promoCode,
      internalNote: data.internalNote,
      customerNote: data.customerNote,
      channel: data.channel,
      placedById: actor.id,
      staffOverride: { allowOversell: true, deliveryFee, initialStatus: data.status === "COMPLETED" ? "CONFIRMED" : data.status },
    });
    const paid = data.amountPaid ? parseMoney(data.amountPaid) : null;
    if (paid && paid > 0) {
      await recordPayment({ orderId: order.id, amount: paid, method: data.paymentMethod, providerRef: data.paymentRef, actor, note: "Taken at order entry" });
    }
    if (data.status === "COMPLETED") await updateOrderStatus(order.id, "COMPLETED", actor, { notify: false });
    await audit({ actor, action: "order.create", entityType: "order", entityId: order.id, summary: `POS order ${order.number} (${data.channel})` });
    id = order.id;
    refresh(order.id);
    return ok(`Order ${order.number} created`);
  });
  if (id) redirect(`/admin/orders/${id}`);
  return res;
}
