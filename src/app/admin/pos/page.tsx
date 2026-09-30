import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, customers, deliveryZones, pickupLocations, products } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { PosScreen } from "@/components/admin/pos";

export const metadata = { title: "New order" };

export default async function PosPage() {
  await requireStaff("pos:use");
  const settings = await getSettings();
  const [prods, custs, zones, pickups] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, price: products.price, unit: products.unit, stockQty: products.stockQty, trackInventory: products.trackInventory, minQty: products.minQty, qtyStep: products.qtyStep, options: products.options, category: categories.name })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(eq(products.status, "ACTIVE"), eq(products.type, "PRODUCT")))
      .orderBy(asc(categories.sortOrder), asc(products.sortOrder)),
    db.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, discountPercent: customers.discountPercent }).from(customers).orderBy(desc(customers.lastOrderAt)).limit(2000),
    db.select({ id: deliveryZones.id, name: deliveryZones.name, fee: deliveryZones.fee }).from(deliveryZones).where(eq(deliveryZones.active, true)).orderBy(asc(deliveryZones.sortOrder)),
    db.select({ id: pickupLocations.id, name: pickupLocations.name }).from(pickupLocations).where(eq(pickupLocations.active, true)),
  ]);
  return (
    <>
      <PageHeader title="New order" description="Take orders from WhatsApp, phone calls, walk-ins and wholesale customers." />
      <PosScreen products={prods} customers={custs} zones={zones} pickups={pickups} currency={settings.commerce.currency} slots={settings.commerce.timeSlots} />
    </>
  );
}
