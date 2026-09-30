import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db";
import { customers, invoices, orderEvents, orders, payments } from "@/lib/db/schema";
import { UserError } from "@/lib/errors";
import { randomCode } from "@/lib/crypto";
import { kickJobs } from "@/lib/jobs/queue";
import { sendTemplate } from "@/lib/messaging";
import { firstName } from "@/lib/messaging/templates";
import { formatMoney } from "@/lib/money";
import { paymentStatusFor } from "@/lib/order-status";
import { getSettings } from "@/lib/settings";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/constants";
import { refreshCustomerStats } from "./customers";

export function paymentReference() {
  return `PAY-${randomCode(8)}`;
}

const netPaid = sql<number>`coalesce(sum(case when ${payments.kind} = 'PAYMENT' then ${payments.amount} else -${payments.amount} end), 0)::int`;
const refunded = sql<number>`coalesce(sum(case when ${payments.kind} = 'REFUND' then ${payments.amount} else 0 end), 0)::int`;

export async function recomputeOrderPayments(tx: DbOrTx, orderId: string) {
  const [sum] = await tx
    .select({ paid: netPaid, refunded })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "SUCCEEDED")));
  const [order] = await tx.select({ total: orders.total }).from(orders).where(eq(orders.id, orderId));
  if (!order) return;
  const paid = sum?.paid ?? 0;
  let status = paymentStatusFor(order.total, paid);
  if ((sum?.refunded ?? 0) > 0 && paid <= 0) status = "REFUNDED";
  await tx.update(orders).set({ amountPaid: paid, paymentStatus: status }).where(eq(orders.id, orderId));
}

export async function recomputeInvoicePayments(tx: DbOrTx, invoiceId: string) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return;
  const [sum] = await tx
    .select({ paid: netPaid })
    .from(payments)
    .where(
      and(
        eq(payments.status, "SUCCEEDED"),
        invoice.orderId ? or(eq(payments.invoiceId, invoiceId), eq(payments.orderId, invoice.orderId)) : eq(payments.invoiceId, invoiceId),
      ),
    );
  const paid = sum?.paid ?? 0;
  let status = invoice.status;
  if (status !== "VOID") {
    if (paid >= invoice.total && invoice.total > 0) status = "PAID";
    else if (paid > 0) status = "PARTIALLY_PAID";
    else if (status === "PAID" || status === "PARTIALLY_PAID") status = "SENT";
  }
  await tx.update(invoices).set({ amountPaid: paid, status }).where(eq(invoices.id, invoiceId));
}

export type RecordPaymentInput = {
  orderId?: string | null;
  invoiceId?: string | null;
  amount: number;
  method: PaymentMethod;
  kind?: "PAYMENT" | "REFUND";
  status?: "PENDING" | "SUCCEEDED";
  provider?: string;
  providerRef?: string | null;
  payerPhone?: string | null;
  note?: string | null;
  actor?: { id: string; name: string } | null;
  notify?: boolean;
  metadata?: Record<string, unknown>;
};

/** Records a payment or refund against an order and/or invoice and updates balances. */
export async function recordPayment(input: RecordPaymentInput) {
  if (!(input.amount > 0)) throw new UserError("Amount must be greater than zero.", { amount: "Must be greater than zero" });
  if (!input.orderId && !input.invoiceId) throw new UserError("Choose an order or invoice.");
  const settings = await getSettings();

  const payment = await db.transaction(async (tx) => {
    let orderId = input.orderId ?? null;
    let invoiceId = input.invoiceId ?? null;
    let customerId: string | null = null;
    if (invoiceId) {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
      if (!inv) throw new UserError("Invoice not found.");
      if (inv.status === "VOID") throw new UserError("This invoice is void.");
      orderId = orderId ?? inv.orderId;
      customerId = inv.customerId;
    }
    if (orderId) {
      const [ord] = await tx.select().from(orders).where(eq(orders.id, orderId));
      if (!ord) throw new UserError("Order not found.");
      customerId = ord.customerId;
      if (!invoiceId) {
        const [inv] = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(and(eq(invoices.orderId, orderId), sql`${invoices.status} <> 'VOID'`))
          .limit(1);
        invoiceId = inv?.id ?? null;
      }
    }
    const status = input.status ?? "SUCCEEDED";
    const [p] = await tx
      .insert(payments)
      .values({
        reference: paymentReference(),
        kind: input.kind ?? "PAYMENT",
        orderId,
        invoiceId,
        customerId,
        method: input.method,
        status,
        amount: input.amount,
        currency: settings.commerce.currency,
        provider: input.provider ?? "manual",
        providerRef: input.providerRef?.trim() || null,
        payerPhone: input.payerPhone ?? null,
        note: input.note ?? null,
        receivedById: input.actor?.id ?? null,
        paidAt: status === "SUCCEEDED" ? new Date() : null,
        metadata: input.metadata,
      })
      .returning();
    if (orderId) {
      await recomputeOrderPayments(tx, orderId);
      await tx.insert(orderEvents).values({
        orderId,
        type: "PAYMENT",
        message: `${input.kind === "REFUND" ? "Refund" : status === "PENDING" ? "Payment submitted (awaiting verification)" : "Payment received"}: ${formatMoney(input.amount, settings.commerce.currency)} via ${PAYMENT_METHOD_LABELS[input.method]}${input.providerRef ? ` (ref ${input.providerRef})` : ""}`,
        isPublic: true,
        actorId: input.actor?.id ?? null,
      });
    }
    if (invoiceId) await recomputeInvoicePayments(tx, invoiceId);
    if (customerId) await refreshCustomerStats(customerId, tx);
    return p!;
  });

  if (payment.status === "SUCCEEDED" && payment.kind === "PAYMENT" && input.notify !== false) {
    await sendReceipt(payment.id).catch((err) => console.error("receipt failed", err));
  }
  kickJobs();
  return payment;
}

/** Marks a pending payment (e.g. a mobile money transfer awaiting verification) as received or failed. */
export async function settlePayment(paymentId: string, outcome: "SUCCEEDED" | "FAILED" | "CANCELLED", actor: { id: string; name: string } | null, extra: { providerRef?: string | null; note?: string | null } = {}) {
  const updated = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!p) throw new UserError("Payment not found.");
    if (p.status !== "PENDING") return null; // idempotent
    const [saved] = await tx
      .update(payments)
      .set({
        status: outcome,
        paidAt: outcome === "SUCCEEDED" ? new Date() : null,
        receivedById: actor?.id ?? p.receivedById,
        providerRef: extra.providerRef ?? p.providerRef,
        note: extra.note ?? p.note,
      })
      .where(eq(payments.id, paymentId))
      .returning();
    if (p.orderId) {
      await recomputeOrderPayments(tx, p.orderId);
      await tx.insert(orderEvents).values({
        orderId: p.orderId,
        type: "PAYMENT",
        message: outcome === "SUCCEEDED" ? `Payment ${p.reference} confirmed: ${formatMoney(p.amount)}` : `Payment ${p.reference} ${outcome.toLowerCase()}`,
        isPublic: true,
        actorId: actor?.id ?? null,
      });
    }
    if (p.invoiceId) await recomputeInvoicePayments(tx, p.invoiceId);
    if (p.customerId) await refreshCustomerStats(p.customerId, tx);
    return saved!;
  });
  if (updated?.status === "SUCCEEDED") await sendReceipt(updated.id).catch((err) => console.error("receipt failed", err));
  kickJobs();
  return updated;
}

async function sendReceipt(paymentId: string) {
  const settings = await getSettings();
  const [row] = await db
    .select({ p: payments, c: customers, o: orders, i: invoices })
    .from(payments)
    .leftJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(orders, eq(orders.id, payments.orderId))
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(eq(payments.id, paymentId));
  if (!row?.c) return;
  const total = row.o?.total ?? row.i?.total ?? 0;
  const paid = row.o?.amountPaid ?? row.i?.amountPaid ?? 0;
  await sendTemplate(
    "payment.received",
    { phone: row.c.phone, email: row.c.email, preferredChannel: row.c.preferredChannel, customerId: row.c.id },
    {
      firstName: firstName(row.c.name),
      amount: formatMoney(row.p.amount, settings.commerce.currency),
      method: PAYMENT_METHOD_LABELS[row.p.method],
      documentNumber: row.o?.number ?? row.i?.number ?? row.p.reference,
      balance: formatMoney(Math.max(0, total - paid), settings.commerce.currency),
    },
    { orderId: row.o?.id ?? null },
  );
}

/** Converts a store-currency amount (cents) into the major-unit string a gateway expects. */
export async function gatewayAmount(cents: number, gatewayCurrency: string) {
  const { commerce } = await getSettings();
  if (gatewayCurrency === commerce.secondaryCurrency && gatewayCurrency !== commerce.currency) {
    return String(Math.round((cents / 100) * commerce.exchangeRate));
  }
  return (cents / 100).toFixed(2);
}
