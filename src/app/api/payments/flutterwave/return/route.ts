import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, payments } from "@/lib/db/schema";
import { confirmFlutterwave } from "@/lib/services/online-payments";
import { appUrl } from "@/lib/request";

export async function GET(request: Request) {
  const txRef = new URL(request.url).searchParams.get("tx_ref");
  if (!txRef) return Response.redirect(appUrl("/"));
  const payment = await confirmFlutterwave(txRef);
  if (!payment?.orderId) return Response.redirect(appUrl("/"));
  const [order] = await db.select({ token: orders.trackingToken }).from(orders).where(eq(orders.id, payment.orderId));
  const [p] = await db.select({ status: payments.status }).from(payments).where(eq(payments.id, payment.id));
  return Response.redirect(appUrl(`/track/${order?.token}?payment=${p?.status === "SUCCEEDED" ? "success" : "failed"}`));
}
