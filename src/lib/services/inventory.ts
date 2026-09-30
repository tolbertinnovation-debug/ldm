import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import { products, stockMovements } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/queue";
import { toMilli } from "@/lib/money";

type MovementType = (typeof stockMovements.$inferInsert)["type"];

export class StockError extends Error {
  constructor(
    message: string,
    public productId: string,
  ) {
    super(message);
    this.name = "StockError";
  }
}

/**
 * Changes a product's stock by `delta` (signed) inside the given transaction
 * and appends a ledger entry. Row-locks the product to prevent overselling.
 */
export async function adjustStock(
  tx: DbOrTx,
  input: {
    productId: string;
    delta: number;
    type: MovementType;
    reference?: string | null;
    orderId?: string | null;
    animalId?: string | null;
    note?: string | null;
    unitCost?: number | null;
    actorId?: string | null;
    enforceAvailable?: boolean;
  },
) {
  const [product] = await tx
    .select({
      id: products.id,
      name: products.name,
      stockQty: products.stockQty,
      trackInventory: products.trackInventory,
      allowBackorder: products.allowBackorder,
      lowStockThreshold: products.lowStockThreshold,
    })
    .from(products)
    .where(eq(products.id, input.productId))
    .for("update");
  if (!product) throw new StockError("Product not found", input.productId);
  if (!product.trackInventory) return { balance: product.stockQty, tracked: false };

  const balance = (toMilli(product.stockQty) + toMilli(input.delta)) / 1000;
  if (input.enforceAvailable && input.delta < 0 && balance < 0 && !product.allowBackorder) {
    throw new StockError(
      product.stockQty <= 0 ? `${product.name} is sold out.` : `Only ${product.stockQty} left of ${product.name}.`,
      product.id,
    );
  }
  await tx.update(products).set({ stockQty: balance }).where(eq(products.id, product.id));
  await tx.insert(stockMovements).values({
    productId: product.id,
    type: input.type,
    quantity: input.delta,
    balanceAfter: balance,
    reference: input.reference ?? null,
    orderId: input.orderId ?? null,
    animalId: input.animalId ?? null,
    note: input.note ?? null,
    unitCost: input.unitCost ?? null,
    createdById: input.actorId ?? null,
  });

  // Crossed the low-stock threshold on the way down → alert once.
  const threshold = product.lowStockThreshold;
  if (input.delta < 0 && threshold > 0 && product.stockQty > threshold && balance <= threshold) {
    await enqueue("stock.alert", { productId: product.id }, { tx });
  }
  return { balance, tracked: true };
}

export async function lowStockProducts(tx: DbOrTx, limit = 20) {
  return tx
    .select({ id: products.id, name: products.name, stockQty: products.stockQty, unit: products.unit, lowStockThreshold: products.lowStockThreshold })
    .from(products)
    .where(
      and(
        eq(products.trackInventory, true),
        eq(products.status, "ACTIVE"),
        eq(products.type, "PRODUCT"),
        sql`${products.stockQty} <= ${products.lowStockThreshold}`,
      ),
    )
    .orderBy(products.stockQty)
    .limit(limit);
}
