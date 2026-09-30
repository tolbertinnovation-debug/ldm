import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";

export type CatalogSort = "featured" | "price-asc" | "price-desc" | "name" | "newest";

export const productCardFields = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  type: products.type,
  shortDescription: products.shortDescription,
  unit: products.unit,
  price: products.price,
  compareAtPrice: products.compareAtPrice,
  images: products.images,
  variableWeight: products.variableWeight,
  stockQty: products.stockQty,
  trackInventory: products.trackInventory,
  allowBackorder: products.allowBackorder,
  availability: products.availability,
  lowStockThreshold: products.lowStockThreshold,
  featured: products.featured,
  minQty: products.minQty,
  qtyStep: products.qtyStep,
  hasOptions: sql<boolean>`jsonb_array_length(${products.options}) > 0`,
  categoryIcon: categories.icon,
  categoryName: categories.name,
  categorySlug: categories.slug,
};

export type ProductCardData = Awaited<ReturnType<typeof listProducts>>[number];

export async function listProducts(opts: { q?: string; categorySlug?: string; sort?: CatalogSort; type?: "PRODUCT" | "SERVICE"; featured?: boolean; limit?: number } = {}) {
  const conds: SQL[] = [eq(products.status, "ACTIVE")];
  if (opts.type) conds.push(eq(products.type, opts.type));
  if (opts.categorySlug) conds.push(eq(categories.slug, opts.categorySlug));
  if (opts.featured) conds.push(eq(products.featured, true));
  if (opts.q?.trim()) {
    const term = `%${opts.q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(
      or(
        ilike(products.name, term),
        ilike(products.shortDescription, term),
        ilike(categories.name, term),
        sql`array_to_string(${products.tags}, ' ') ilike ${term}`,
      )!,
    );
  }
  const order =
    opts.sort === "price-asc"
      ? [asc(products.price)]
      : opts.sort === "price-desc"
        ? [desc(products.price)]
        : opts.sort === "name"
          ? [asc(products.name)]
          : opts.sort === "newest"
            ? [desc(products.createdAt)]
            : [desc(products.featured), asc(categories.sortOrder), asc(products.sortOrder)];
  return db
    .select(productCardFields)
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...conds))
    .orderBy(...order)
    .limit(opts.limit ?? 200);
}

export async function getProductBySlug(slug: string) {
  const [row] = await db
    .select({ product: products, category: categories })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.status, "ACTIVE")))
    .limit(1);
  return row ?? null;
}

export async function categoriesWithCounts() {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      icon: categories.icon,
      description: categories.description,
      count: sql<number>`count(${products.id}) filter (where ${products.status} = 'ACTIVE')::int`,
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .where(eq(categories.active, true))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder));
}

export function stockLabel(p: { trackInventory: boolean; stockQty: number; allowBackorder: boolean; availability: string; lowStockThreshold: number; type?: string }) {
  if (p.type === "SERVICE") return { label: "Book now", tone: "brand" as const, soldOut: false };
  if (p.availability === "PREORDER") return { label: "Pre-order", tone: "info" as const, soldOut: false };
  if (p.availability === "MADE_TO_ORDER") return { label: "Made to order", tone: "info" as const, soldOut: false };
  if (!p.trackInventory) return { label: "Available", tone: "success" as const, soldOut: false };
  if (p.stockQty <= 0) return p.allowBackorder ? { label: "Backorder", tone: "warning" as const, soldOut: false } : { label: "Sold out", tone: "danger" as const, soldOut: true };
  if (p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold) return { label: "Few left", tone: "warning" as const, soldOut: false };
  return { label: "In stock", tone: "success" as const, soldOut: false };
}
