import "server-only";
import { and, eq, gte, lt, or, sql, type SQL, arrayOverlaps, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderItems, orders, products, type AudienceFilter } from "@/lib/db/schema";
import type { MessageChannel } from "@/lib/constants";

/**
 * Builds the customer audience for a marketing broadcast. Only customers who
 * opted in to marketing on that channel are ever included.
 */
export function audienceWhere(filter: AudienceFilter, channel: MessageChannel): SQL {
  const conds: SQL[] = [];
  if (channel === "EMAIL") conds.push(eq(customers.marketingEmail, true), sql`${customers.email} is not null`);
  else if (channel === "SMS") conds.push(eq(customers.marketingSms, true), sql`${customers.phone} is not null`);
  else conds.push(eq(customers.marketingWhatsapp, true), sql`${customers.phone} is not null`);

  if (filter.types?.length) conds.push(inArray(customers.type, filter.types as (typeof customers.$inferSelect)["type"][]));
  if (filter.tags?.length) conds.push(arrayOverlaps(customers.tags, filter.tags));
  if (filter.orderedWithinDays) conds.push(gte(customers.lastOrderAt, sql`now() - make_interval(days => ${filter.orderedWithinDays})`));
  if (filter.notOrderedWithinDays)
    conds.push(or(isNull(customers.lastOrderAt), lt(customers.lastOrderAt, sql`now() - make_interval(days => ${filter.notOrderedWithinDays})`))!);
  if (filter.minTotalSpent) conds.push(gte(customers.totalSpent, filter.minTotalSpent));
  if (filter.productCategoryId) {
    conds.push(
      sql`exists (select 1 from ${orders} join ${orderItems} on ${orderItems.orderId} = ${orders.id} join ${products} on ${products.id} = ${orderItems.productId}
        where ${orders.customerId} = ${customers.id} and ${orders.status} <> 'CANCELLED' and ${products.categoryId} = ${filter.productCategoryId})`,
    );
  }
  return and(...conds)!;
}

export async function audienceCount(filter: AudienceFilter, channel: MessageChannel) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(audienceWhere(filter, channel));
  return row?.n ?? 0;
}

export async function audienceMembers(filter: AudienceFilter, channel: MessageChannel) {
  return db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email })
    .from(customers)
    .where(audienceWhere(filter, channel));
}
