"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseMoney, toMilli } from "@/lib/money";
import { adjustStock } from "@/lib/services/inventory";

const OUTGOING = new Set(["SPOILAGE", "MORTALITY"]);

export async function adjustStockAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("inventory:manage");
    const d = z
      .object({
        productId: z.uuid(),
        mode: z.enum(["RECEIVE", "PRODUCTION", "SPOILAGE", "MORTALITY", "ADJUSTMENT", "COUNT"]),
        quantity: zf.decimal("Quantity", -1_000_000, 10_000_000),
        unitCost: zf.optionalText(20),
        note: zf.optionalText(300),
      })
      .parse(formObject(formData));
    const result = await db.transaction(async (tx) => {
      const [p] = await tx.select({ stockQty: products.stockQty, name: products.name, trackInventory: products.trackInventory }).from(products).where(eq(products.id, d.productId));
      if (!p) throw new UserError("Product not found.");
      if (!p.trackInventory) throw new UserError("Stock tracking is off for this product.");
      let delta = d.quantity;
      let type: "RECEIVE" | "PRODUCTION" | "SPOILAGE" | "MORTALITY" | "ADJUSTMENT" = d.mode === "COUNT" ? "ADJUSTMENT" : d.mode;
      if (d.mode === "COUNT") {
        if (d.quantity < 0) throw new UserError("A stock count cannot be negative.", { quantity: "Must be 0 or more" });
        delta = (toMilli(d.quantity) - toMilli(p.stockQty)) / 1000;
        type = "ADJUSTMENT";
      } else if (OUTGOING.has(d.mode)) delta = -Math.abs(d.quantity);
      else if (d.mode !== "ADJUSTMENT") delta = Math.abs(d.quantity);
      if (delta === 0) return { name: p.name, delta, balance: p.stockQty };
      const r = await adjustStock(tx, {
        productId: d.productId,
        delta,
        type,
        reference: d.mode === "COUNT" ? "Stock count" : null,
        note: d.note,
        unitCost: d.unitCost ? parseMoney(d.unitCost) : null,
        actorId: actor.id,
      });
      return { name: p.name, delta, balance: r.balance };
    });
    await audit({ actor, action: "stock.adjust", entityType: "product", entityId: d.productId, summary: `${result.name}: ${d.mode} ${result.delta > 0 ? "+" : ""}${result.delta} → ${result.balance}`, data: { note: d.note } });
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/products/${d.productId}`);
    return ok(`Stock updated: ${result.name} now ${result.balance}`);
  });
}
