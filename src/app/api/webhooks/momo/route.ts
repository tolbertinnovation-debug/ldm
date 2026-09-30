import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { checkMomoPayment } from "@/lib/services/online-payments";

/**
 * MTN MoMo callback. The body is not signed, so we never trust it: we look up
 * the payment by reference and re-check its status with the MoMo API.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { externalId?: string; financialTransactionId?: string; referenceId?: string };
  const ref = request.headers.get("x-reference-id") ?? body.referenceId;
  if (!ref) return new Response("OK");
  const [p] = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.provider, "mtn_momo"), eq(payments.providerRef, ref)));
  if (p) await checkMomoPayment(p.id).catch(() => {});
  return new Response("OK");
}
export const PUT = POST;
