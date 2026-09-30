import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";

export async function resetDatabase() {
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrate(db, { migrationsFolder: "drizzle" });
}

export async function seedBasics() {
  const [cat] = await db.insert(s.categories).values({ name: "Pork", slug: "pork" }).returning();
  const [fish] = await db.insert(s.categories).values({ name: "Fish", slug: "fish" }).returning();
  const [chops] = await db
    .insert(s.products)
    .values({ name: "Pork Chops", slug: "pork-chops", categoryId: cat!.id, unit: "LB", price: 450, costPrice: 200, variableWeight: true, minQty: 1, qtyStep: 0.5, stockQty: 20, lowStockThreshold: 5 })
    .returning();
  const [pig] = await db
    .insert(s.products)
    .values({
      name: "Finisher Pig",
      slug: "finisher-pig",
      categoryId: cat!.id,
      unit: "HEAD",
      price: 26000,
      costPrice: 15000,
      stockQty: 2,
      options: [{ name: "Processing", required: true, choices: [{ label: "Live", priceDelta: 0 }, { label: "Slaughter & clean", priceDelta: 2000 }] }],
    })
    .returning();
  const [tilapia] = await db.insert(s.products).values({ name: "Live Tilapia", slug: "live-tilapia", categoryId: fish!.id, unit: "KG", price: 400, stockQty: 100, allowDelivery: false }).returning();
  const [zone] = await db.insert(s.deliveryZones).values({ name: "Paynesville", fee: 500, freeOver: 10000 }).returning();
  const [pickup] = await db.insert(s.pickupLocations).values({ name: "Farm", address: "Bentol City" }).returning();
  const [promo] = await db.insert(s.promotions).values({ name: "Welcome", code: "WELCOME10", type: "PERCENT", value: 10, usageLimit: 1 }).returning();
  return { cat: cat!, chops: chops!, pig: pig!, tilapia: tilapia!, zone: zone!, pickup: pickup!, promo: promo! };
}
