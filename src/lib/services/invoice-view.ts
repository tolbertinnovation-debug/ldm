import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerAddresses, customers, invoiceItems, invoices } from "@/lib/db/schema";

export async function loadInvoice(by: { id?: string; token?: string }) {
  const [inv] = await db.select().from(invoices).where(by.id ? eq(invoices.id, by.id) : eq(invoices.publicToken, by.token!));
  if (!inv) return null;
  const [items, [customer], [address]] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id)).orderBy(asc(invoiceItems.sortOrder)),
    db.select().from(customers).where(eq(customers.id, inv.customerId)),
    db.select().from(customerAddresses).where(eq(customerAddresses.customerId, inv.customerId)).limit(1),
  ]);
  return { inv, items, customer: customer!, address: address ? [address.line1, address.area, address.city].filter(Boolean).join(", ") : null };
}
