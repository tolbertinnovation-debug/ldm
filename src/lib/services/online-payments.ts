import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, payments } from "@/lib/db/schema";
import { UserError } from "@/lib/actions";
import { enqueue, kickJobs } from "@/lib/jobs/queue";
import { flutterwaveCheckout, flutterwaveConfigured, flutterwaveVerify, momoConfigured, momoRequestToPay, momoStatus } from "@/lib/payments/gateways";
import { normalizePhone } from "@/lib/phone";
import { appUrl } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { gatewayAmount, paymentReference, settlePayment } from "./payments";

/** Push an MTN MoMo payment prompt to the customer's phone for the order balance. */
export async function startMomoPayment(orderId: string, phoneInput: string) {
  if (!momoConfigured()) throw new UserError("MTN MoMo online payments are not set up.");
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new UserError("Enter a valid MTN number.", { phone: "Invalid number" });
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new UserError("Order not found.");
  const due = order.total - order.amountPaid;
  if (due <= 0) throw new UserError("This order is already paid.");
  const currency = process.env.MTN_MOMO_CURRENCY ?? "EUR";
  const referenceId = await momoRequestToPay({
    amount: await gatewayAmount(due, currency),
    currency,
    phone,
    externalId: order.number,
    note: `Order ${order.number}`,
    callbackUrl: appUrl("/api/webhooks/momo"),
  });
  const settings = await getSettings();
  const [p] = await db
    .insert(payments)
    .values({
      reference: paymentReference(),
      orderId,
      customerId: order.customerId,
      method: "MTN_MOMO",
      status: "PENDING",
      amount: due,
      currency: settings.commerce.currency,
      provider: "mtn_momo",
      providerRef: referenceId,
      payerPhone: phone,
    })
    .returning();
  await enqueue("payment.check", { paymentId: p!.id }, { runAt: new Date(Date.now() + 20_000), maxAttempts: 10 });
  kickJobs();
  return p!;
}

/** Poll MoMo for the result; throws while still pending so the job retries with backoff. */
export async function checkMomoPayment(paymentId: string) {
  const [p] = await db.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.provider, "mtn_momo")));
  if (!p || p.status !== "PENDING" || !p.providerRef) return;
  const result = await momoStatus(p.providerRef);
  if (result.status === "SUCCESSFUL") {
    await settlePayment(p.id, "SUCCEEDED", null, { note: result.transactionId ? `MoMo txn ${result.transactionId}` : null });
  } else if (result.status === "FAILED") {
    await settlePayment(p.id, "FAILED", null, { note: result.reason ?? "Declined or timed out" });
  } else if (Date.now() - p.createdAt.getTime() > 30 * 60 * 1000) {
    await settlePayment(p.id, "FAILED", null, { note: "No response from customer within 30 minutes" });
  } else {
    throw new Error("MoMo payment still pending");
  }
}

/** Creates a Flutterwave hosted checkout for the order balance and returns its URL. */
export async function startCardPayment(orderId: string) {
  if (!flutterwaveConfigured()) throw new UserError("Card payments are not set up.");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new UserError("Order not found.");
  const due = order.total - order.amountPaid;
  if (due <= 0) throw new UserError("This order is already paid.");
  const settings = await getSettings();
  const txRef = `${order.number}-${paymentReference().slice(4)}`;
  await db.insert(payments).values({
    reference: paymentReference(),
    orderId,
    customerId: order.customerId,
    method: "CARD",
    status: "PENDING",
    amount: due,
    currency: settings.commerce.currency,
    provider: "flutterwave",
    providerRef: txRef,
  });
  return flutterwaveCheckout({
    txRef,
    amount: due / 100,
    currency: settings.commerce.currency,
    redirectUrl: appUrl(`/api/payments/flutterwave/return`),
    customer: { email: order.contactEmail, phone: order.contactPhone, name: order.contactName },
    title: settings.business.name,
  });
}

/** Verifies a Flutterwave transaction server-side (never trust redirect params). */
export async function confirmFlutterwave(txRef: string) {
  const [p] = await db.select().from(payments).where(and(eq(payments.provider, "flutterwave"), eq(payments.providerRef, txRef)));
  if (!p) return null;
  if (p.status !== "PENDING") return p;
  const result = await flutterwaveVerify(txRef);
  if (result.ok && Math.round(result.amount * 100) >= p.amount && result.currency === p.currency) {
    return settlePayment(p.id, "SUCCEEDED", null, { note: `Flutterwave txn ${result.transactionId ?? ""}` });
  }
  if (!result.ok) return settlePayment(p.id, "FAILED", null, { note: "Card payment not completed" });
  return p;
}
