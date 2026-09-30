"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { SALES_UNITS } from "@/lib/constants";
import { adjustStock } from "@/lib/services/inventory";
import { slugify } from "@/lib/slug";


const optionGroups = z.array(
  z.object({
    name: z.string().trim().min(1).max(60),
    required: z.boolean(),
    choices: z.array(z.object({ label: z.string().trim().min(1).max(60), priceDelta: z.number().int().min(-1_000_000).max(1_000_000) })).min(1).max(20),
  }),
).max(8);

const productSchema = z.object({
  id: zf.optionalUuid(),
  type: z.enum(["PRODUCT", "SERVICE"]),
  name: zf.requiredText("Name", 160),
  slug: zf.optionalText(90),
  sku: zf.optionalText(60),
  categoryId: zf.optionalUuid(),
  shortDescription: zf.optionalText(300),
  description: zf.optionalText(5000),
  unit: z.enum(SALES_UNITS),
  price: z.string(),
  compareAtPrice: zf.optionalText(20),
  costPrice: zf.optionalText(20),
  pricingNote: zf.optionalText(300),
  variableWeight: zf.checkbox(),
  minQty: zf.decimal("Minimum quantity", 0.001, 100000),
  qtyStep: zf.decimal("Quantity step", 0.001, 100000),
  maxQty: zf.optionalDecimal(0.001, 1000000),
  trackInventory: zf.checkbox(),
  openingStock: zf.optionalDecimal(0, 10_000_000),
  lowStockThreshold: zf.decimal("Low stock threshold", 0, 10_000_000),
  allowBackorder: zf.checkbox(),
  availability: z.enum(["IN_STOCK", "PREORDER", "MADE_TO_ORDER"]),
  leadTimeDays: zf.int("Lead time", 0, 365),
  allowDelivery: zf.checkbox(),
  allowPickup: zf.checkbox(),
  taxable: zf.checkbox(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  featured: zf.checkbox(),
  tags: zf.optionalText(300),
  attributes: zf.optionalText(3000),
  options: z.string().default("[]"),
  images: z.string().default("[]"),
});

function parseAttributes(text: string | null) {
  const out: Record<string, string> = {};
  for (const line of (text ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const k = line.slice(0, idx).trim().slice(0, 60);
      const v = line.slice(idx + 1).trim().slice(0, 200);
      if (k && v) out[k] = v;
    }
  }
  return out;
}

export async function saveProductAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const res = await runAction(async () => {
    const actor = await assertPermission("products:manage");
    const d = productSchema.parse(formObject(formData));
    const price = parseMoney(d.price);
    if (price === null || price < 0) throw new UserError("Enter a valid price.", { price: "Invalid price" });
    const compareAt = d.compareAtPrice ? parseMoney(d.compareAtPrice) : null;
    const cost = d.costPrice ? parseMoney(d.costPrice) : null;
    const options = optionGroups.parse(JSON.parse(d.options));
    const images = z.array(z.string().max(500).refine((u) => u.startsWith("/media/") || u.startsWith("https://"), "Images must be uploaded or https URLs")).max(10).parse(JSON.parse(d.images));
    const slug = slugify(d.slug || d.name);
    if (!slug) throw new UserError("Enter a name.", { name: "Required" });
    const [clash] = await db.select({ id: products.id }).from(products).where(d.id ? and(eq(products.slug, slug), ne(products.id, d.id)) : eq(products.slug, slug));
    if (clash) throw new UserError("Another product already uses this URL slug.", { slug: "Already in use" });
    if (d.sku) {
      const [skuClash] = await db.select({ id: products.id }).from(products).where(d.id ? and(eq(products.sku, d.sku), ne(products.id, d.id)) : eq(products.sku, d.sku));
      if (skuClash) throw new UserError("Another product already uses this SKU.", { sku: "Already in use" });
    }
    const values = {
      type: d.type,
      name: d.name,
      slug,
      sku: d.sku,
      categoryId: d.categoryId,
      shortDescription: d.shortDescription,
      description: d.description,
      unit: d.unit,
      price,
      compareAtPrice: compareAt,
      costPrice: cost,
      pricingNote: d.pricingNote,
      variableWeight: d.variableWeight,
      minQty: d.minQty,
      qtyStep: d.qtyStep,
      maxQty: d.maxQty,
      trackInventory: d.type === "PRODUCT" && d.trackInventory,
      lowStockThreshold: d.lowStockThreshold,
      allowBackorder: d.allowBackorder,
      availability: d.availability,
      leadTimeDays: d.leadTimeDays,
      allowDelivery: d.allowDelivery,
      allowPickup: d.allowPickup,
      taxable: d.taxable,
      status: d.status,
      featured: d.featured,
      tags: (d.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
      attributes: parseAttributes(d.attributes),
      options,
      images,
    };
    if (d.id) {
      const [before] = await db.select({ price: products.price, status: products.status }).from(products).where(eq(products.id, d.id));
      await db.update(products).set(values).where(eq(products.id, d.id));
      await audit({ actor, action: "product.update", entityType: "product", entityId: d.id, summary: `Updated ${d.name}${before && before.price !== price ? ` (price ${before.price} → ${price})` : ""}`, data: { priceBefore: before?.price, priceAfter: price } });
      revalidatePath(`/admin/products/${d.id}`);
    } else {
      const created = await db.transaction(async (tx) => {
        const [p] = await tx.insert(products).values({ ...values, stockQty: 0 }).returning();
        if (d.openingStock && values.trackInventory) {
          await adjustStock(tx, { productId: p!.id, delta: d.openingStock, type: "RECEIVE", reference: "Opening stock", unitCost: cost, actorId: actor.id });
        }
        return p!;
      });
      newId = created.id;
      await audit({ actor, action: "product.create", entityType: "product", entityId: created.id, summary: `Created ${d.name}` });
    }
    revalidatePath("/admin/products");
    revalidatePath("/", "layout");
    return ok("Product saved");
  });
  if (newId) redirect(`/admin/products/${newId}`);
  return res;
}

export async function saveCategoryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("products:manage");
    const d = z
      .object({ id: zf.optionalUuid(), name: zf.requiredText("Name", 80), description: zf.optionalText(400), icon: zf.optionalText(30), sortOrder: zf.int("Order", 0, 1000), active: zf.checkbox() })
      .parse(formObject(formData));
    const slug = slugify(d.name);
    if (d.id) await db.update(categories).set({ name: d.name, description: d.description, icon: d.icon, sortOrder: d.sortOrder, active: d.active }).where(eq(categories.id, d.id));
    else {
      const [clash] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
      if (clash) throw new UserError("A category with this name exists.", { name: "Already exists" });
      await db.insert(categories).values({ name: d.name, slug, description: d.description, icon: d.icon, sortOrder: d.sortOrder, active: d.active });
    }
    await audit({ actor, action: "category.save", entityType: "category", entityId: d.id, summary: `Saved category ${d.name}` });
    revalidatePath("/admin/products");
    revalidatePath("/", "layout");
    return ok("Category saved");
  });
}
