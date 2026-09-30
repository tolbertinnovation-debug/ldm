"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookings, customers } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { sendTemplate } from "@/lib/messaging";
import { firstName } from "@/lib/messaging/templates";
import { formatDate } from "@/lib/format";
import { createManualInvoice } from "@/lib/services/invoices";

export async function updateBookingAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("bookings:manage");
    const d = z
      .object({ id: z.uuid(), status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]), scheduledDate: zf.optionalDate(), preferredTime: zf.optionalText(40), quotedAmount: zf.optionalText(20), internalNote: zf.optionalText(2000), notify: zf.checkbox() })
      .parse(formObject(formData));
    const [b] = await db.select().from(bookings).where(eq(bookings.id, d.id));
    if (!b) throw new UserError("Booking not found.");
    const quoted = d.quotedAmount ? parseMoney(d.quotedAmount) : null;
    await db
      .update(bookings)
      .set({ status: d.status, preferredDate: d.scheduledDate ?? b.preferredDate, preferredTime: d.preferredTime ?? b.preferredTime, quotedAmount: quoted ?? b.quotedAmount, internalNote: d.internalNote, scheduledAt: d.status === "CONFIRMED" && d.scheduledDate ? new Date(`${d.scheduledDate}T09:00:00Z`) : b.scheduledAt })
      .where(eq(bookings.id, d.id));
    if (d.notify && d.status === "CONFIRMED" && b.status !== "CONFIRMED") {
      const [c] = await db.select().from(customers).where(eq(customers.id, b.customerId));
      await sendTemplate("booking.confirmed", { phone: b.contactPhone, email: b.contactEmail, preferredChannel: c?.preferredChannel, customerId: b.customerId }, { firstName: firstName(b.contactName), service: b.serviceName, bookingNumber: b.number, when: [d.scheduledDate ? formatDate(d.scheduledDate) : b.preferredDate ? formatDate(b.preferredDate) : "", d.preferredTime ?? b.preferredTime].filter(Boolean).join(", ") || "the agreed date" });
    }
    await audit({ actor, action: "booking.update", entityType: "booking", entityId: d.id, summary: `${b.number} → ${d.status}` });
    revalidatePath("/admin/bookings");
    return ok("Booking updated");
  });
}

export async function invoiceBookingAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("invoices:manage");
    const id = z.uuid().parse(formData.get("id"));
    const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!b) throw new UserError("Booking not found.");
    if (!b.quotedAmount) throw new UserError("Set a quoted amount first.");
    const invId = await createManualInvoice({ customerId: b.customerId, lines: [{ description: `${b.serviceName} (${b.number})`, quantity: 1, unitPrice: b.quotedAmount, productId: b.serviceId }], actorId: actor.id });
    await audit({ actor, action: "invoice.create", entityType: "invoice", entityId: invId, summary: `Invoice for booking ${b.number}` });
    revalidatePath("/admin/invoices");
    return ok("Invoice created — see Invoices");
  });
}
