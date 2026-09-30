import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, invoiceItems, invoices, orderItems, orders } from "@/lib/db/schema";
import { UserError } from "@/lib/errors";
import { sendTemplate } from "@/lib/messaging";
import { firstName } from "@/lib/messaging/templates";
import { formatMoney, lineTotal, percentOf } from "@/lib/money";
import { appUrl } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { formatQuantity, unitLabel } from "@/lib/constants";
import { recomputeInvoicePayments } from "./payments";

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function nextInvoiceNumber() {
  const res = await db.execute<{ n: string }>(sql`select nextval('invoice_number_seq')::text as n`);
  return `INV-${res.rows[0]!.n}`;
}

/** Invoice from an existing order (copies lines, discount, delivery and tax). */
export async function createInvoiceFromOrder(orderId: string, actorId: string) {
  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.orderId, orderId), sql`${invoices.status} <> 'VOID'`));
  if (existing) return existing.id;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new UserError("Order not found.");
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const settings = await getSettings();
  const issueDate = todayIso();
  const number = await nextInvoiceNumber();

  const id = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(invoices)
      .values({
        number,
        customerId: order.customerId,
        orderId,
        status: "DRAFT",
        issueDate,
        dueDate: addDays(issueDate, settings.invoice.dueDays),
        subtotal: order.subtotal + order.deliveryFee,
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        total: order.total,
        notes: settings.invoice.notes,
        terms: settings.invoice.terms,
        createdById: actorId,
      })
      .returning();
    const rows = items.map((it, i) => ({
      invoiceId: inv!.id,
      productId: it.productId,
      description: it.options.length ? `${it.name} (${it.options.map((o) => o.choice).join(", ")})` : it.name,
      unit: unitLabel(it.unit),
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      sortOrder: i,
    }));
    if (order.deliveryFee > 0) {
      rows.push({ invoiceId: inv!.id, productId: null, description: "Delivery", unit: "trip", quantity: 1, unitPrice: order.deliveryFee, lineTotal: order.deliveryFee, sortOrder: rows.length });
    }
    if (rows.length) await tx.insert(invoiceItems).values(rows);
    await recomputeInvoicePayments(tx, inv!.id);
    return inv!.id;
  });
  return id;
}

export type ManualInvoiceLine = { description: string; quantity: number; unit?: string | null; unitPrice: number; productId?: string | null };

/** Stand-alone invoice (e.g. wholesale on credit, training fees, consultancy). */
export async function createManualInvoice(input: {
  customerId: string;
  lines: ManualInvoiceLine[];
  discount?: number;
  taxRate?: number;
  issueDate?: string;
  dueDate?: string;
  notes?: string | null;
  terms?: string | null;
  actorId: string;
}) {
  if (!input.lines.length) throw new UserError("Add at least one line.");
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId));
  if (!customer) throw new UserError("Choose a customer.", { customerId: "Required" });
  const settings = await getSettings();
  const lineTotals = input.lines.map((l) => lineTotal(l.unitPrice, l.quantity));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const discount = Math.min(subtotal, Math.max(0, input.discount ?? 0));
  const taxTotal = percentOf(subtotal - discount, input.taxRate ?? settings.commerce.taxRate);
  const issueDate = input.issueDate ?? todayIso();
  const number = await nextInvoiceNumber();
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(invoices)
      .values({
        number,
        customerId: input.customerId,
        status: "DRAFT",
        issueDate,
        dueDate: input.dueDate ?? addDays(issueDate, settings.invoice.dueDays),
        subtotal,
        discountTotal: discount,
        taxTotal,
        total: subtotal - discount + taxTotal,
        notes: input.notes ?? settings.invoice.notes,
        terms: input.terms ?? settings.invoice.terms,
        createdById: input.actorId,
      })
      .returning();
    await tx.insert(invoiceItems).values(
      input.lines.map((l, i) => ({
        invoiceId: inv!.id,
        productId: l.productId ?? null,
        description: l.description,
        unit: l.unit ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: lineTotals[i]!,
        sortOrder: i,
      })),
    );
    return inv!.id;
  });
}

/** Marks the invoice as sent and messages the customer a link to view/print it. */
export async function sendInvoice(invoiceId: string) {
  const [row] = await db
    .select({ inv: invoices, c: customers })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(eq(invoices.id, invoiceId));
  if (!row) throw new UserError("Invoice not found.");
  if (row.inv.status === "VOID") throw new UserError("This invoice is void.");
  const settings = await getSettings();
  await sendTemplate(
    "invoice.sent",
    { phone: row.c.phone, email: row.c.email, preferredChannel: row.c.preferredChannel, customerId: row.c.id },
    {
      firstName: firstName(row.c.name),
      invoiceNumber: row.inv.number,
      total: formatMoney(row.inv.total, settings.commerce.currency),
      dueDate: row.inv.dueDate,
      invoiceUrl: appUrl(`/invoice/${row.inv.publicToken}`),
    },
    { orderId: row.inv.orderId },
  );
  await db
    .update(invoices)
    .set({ sentAt: new Date(), status: row.inv.status === "DRAFT" ? "SENT" : row.inv.status })
    .where(eq(invoices.id, invoiceId));
}

export function isOverdue(inv: { status: string; dueDate: string }) {
  return (inv.status === "SENT" || inv.status === "PARTIALLY_PAID") && inv.dueDate < todayIso();
}

export function describeQuantity(q: number, unit: string | null) {
  return unit ? `${q % 1 === 0 ? q : q.toFixed(2)} ${unit}` : formatQuantity(q, "EACH");
}
