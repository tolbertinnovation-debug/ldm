import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db";
import { customers, orders, payments } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/phone";

/**
 * Finds a customer by phone (the primary identity in a phone-first market),
 * falling back to email, and creates one if needed. Fills in missing details.
 */
export async function findOrCreateCustomer(
  tx: DbOrTx,
  input: { name: string; phone: string; email?: string | null; userId?: string | null; source?: string | null; type?: (typeof customers.$inferInsert)["type"] },
) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("Invalid phone number");
  const email = input.email?.trim().toLowerCase() || null;

  let [existing] = input.userId
    ? await tx.select().from(customers).where(eq(customers.userId, input.userId)).limit(1)
    : [];
  if (!existing) [existing] = await tx.select().from(customers).where(eq(customers.phone, phone)).limit(1);

  if (existing) {
    const patch: Partial<typeof customers.$inferInsert> = {};
    if (!existing.email && email) patch.email = email;
    if (!existing.userId && input.userId) patch.userId = input.userId;
    if (!existing.phone) patch.phone = phone;
    if ((existing.name === existing.phone || !existing.name) && input.name) patch.name = input.name;
    if (Object.keys(patch).length) {
      const [updated] = await tx.update(customers).set(patch).where(eq(customers.id, existing.id)).returning();
      return updated!;
    }
    return existing;
  }
  const [created] = await tx
    .insert(customers)
    .values({
      name: input.name,
      phone,
      email,
      userId: input.userId ?? null,
      source: input.source ?? null,
      type: input.type ?? "INDIVIDUAL",
      marketingWhatsapp: false,
    })
    .returning();
  return created!;
}

/** Recomputes the denormalised order stats used for segmentation and CRM lists. */
export async function refreshCustomerStats(customerId: string, tx: DbOrTx = db) {
  await tx.execute(sql`
    update customers c set
      orders_count = s.cnt,
      total_spent = s.spent,
      last_order_at = s.last_at
    from (
      select
        count(*) filter (where o.status <> 'CANCELLED')::int as cnt,
        coalesce(sum(o.total) filter (where o.status <> 'CANCELLED'), 0)::int as spent,
        max(o.created_at) filter (where o.status <> 'CANCELLED') as last_at
      from orders o where o.customer_id = ${customerId}
    ) s
    where c.id = ${customerId}
  `);
}

export async function customerBalance(customerId: string) {
  const [row] = await db
    .select({ due: sql<number>`coalesce(sum(${orders.total} - ${orders.amountPaid}), 0)::int` })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), inArray(orders.paymentStatus, ["UNPAID", "PARTIALLY_PAID"]), sql`${orders.status} <> 'CANCELLED'`));
  return row?.due ?? 0;
}

export async function customerPaymentsTotal(customerId: string) {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(case when ${payments.kind} = 'PAYMENT' then ${payments.amount} else -${payments.amount} end), 0)::int` })
    .from(payments)
    .where(and(eq(payments.customerId, customerId), eq(payments.status, "SUCCEEDED")));
  return row?.n ?? 0;
}
