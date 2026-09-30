"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { createManualInvoice, sendInvoice } from "@/lib/services/invoices";

export async function createInvoiceManualAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string | null = null;
  const res = await runAction(async () => {
    const actor = await assertPermission("invoices:manage");
    const d = z.object({ customerId: zf.optionalUuid(), issueDate: zf.optionalDate(), dueDate: zf.optionalDate(), discount: zf.optionalText(20), notes: zf.optionalText(2000), terms: zf.optionalText(2000), lines: z.string() }).parse(formObject(formData));
    if (!d.customerId) throw new UserError("Choose a customer.", { customerId: "Required" });
    const lines = z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.number().positive(), unit: z.string().max(20).optional(), unitPrice: z.string() })).min(1, "Add at least one line").parse(JSON.parse(d.lines));
    id = await createManualInvoice({
      customerId: d.customerId,
      lines: lines.map((l) => {
        const price = parseMoney(l.unitPrice);
        if (price === null) throw new UserError(`Invalid price for "${l.description}".`);
        return { description: l.description, quantity: l.quantity, unit: l.unit || null, unitPrice: price };
      }),
      discount: d.discount ? parseMoney(d.discount) ?? 0 : 0,
      issueDate: d.issueDate ?? undefined,
      dueDate: d.dueDate ?? undefined,
      notes: d.notes,
      terms: d.terms,
      actorId: actor.id,
    });
    await audit({ actor, action: "invoice.create", entityType: "invoice", entityId: id, summary: "Manual invoice created" });
    return ok();
  });
  if (id) redirect(`/admin/invoices/${id}`);
  return res;
}

export async function invoiceStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("invoices:manage");
    const d = z.object({ id: z.uuid(), op: z.enum(["send", "void", "mark-sent"]) }).parse(formObject(formData));
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, d.id));
    if (!inv) throw new UserError("Invoice not found.");
    if (d.op === "send") await sendInvoice(d.id);
    else if (d.op === "mark-sent") await db.update(invoices).set({ status: inv.status === "DRAFT" ? "SENT" : inv.status, sentAt: new Date() }).where(eq(invoices.id, d.id));
    else {
      if (inv.amountPaid > 0) throw new UserError("Refund payments before voiding this invoice.");
      await db.update(invoices).set({ status: "VOID" }).where(eq(invoices.id, d.id));
    }
    await audit({ actor, action: `invoice.${d.op}`, entityType: "invoice", entityId: d.id, summary: `${inv.number}: ${d.op}` });
    revalidatePath(`/admin/invoices/${d.id}`);
    revalidatePath("/admin/invoices");
    return ok(d.op === "send" ? "Invoice sent to customer" : d.op === "void" ? "Invoice voided" : "Marked as sent");
  });
}
