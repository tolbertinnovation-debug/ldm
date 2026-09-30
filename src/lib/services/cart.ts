import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cartItems, carts, customers, deliveryZones, products, type SelectedOption } from "@/lib/db/schema";
import { UserError } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { calculatePricing, optionsKey, quantityProblem } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { customerPromoContext, loadPromotionByCode, resolveOptions } from "./orders";

const CART_COOKIE = "reap_cart";
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readCartId() {
  const jar = await cookies();
  const id = jar.get(CART_COOKIE)?.value;
  return id && uuidRe.test(id) ? id : null;
}

/** Returns the visitor's cart id, creating a cart (and cookie) when `create` is set. */
export async function getCartId(create: boolean): Promise<string | null> {
  const user = await getCurrentUser();
  let id = await readCartId();
  if (id) {
    const [cart] = await db.select({ id: carts.id, userId: carts.userId }).from(carts).where(eq(carts.id, id));
    if (!cart) id = null;
    else if (user && !cart.userId) await db.update(carts).set({ userId: user.id }).where(eq(carts.id, id));
  }
  if (!id && user) {
    const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, user.id)).orderBy(sql`${carts.updatedAt} desc`).limit(1);
    if (cart) id = cart.id;
  }
  if (!id && create) {
    const [cart] = await db.insert(carts).values({ userId: user?.id ?? null }).returning({ id: carts.id });
    id = cart!.id;
  }
  if (id && create) {
    const jar = await cookies();
    jar.set(CART_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 60 });
  }
  return id;
}

export async function addToCart(productId: string, quantity: number, chosen: { group: string; choice: string }[] = []) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product || product.status !== "ACTIVE" || product.type !== "PRODUCT") throw new UserError("This item is not available.");
  const problem = quantityProblem(quantity, product);
  if (problem) throw new UserError(problem);
  if (product.trackInventory && !product.allowBackorder && product.availability === "IN_STOCK" && product.stockQty <= 0) {
    throw new UserError(`${product.name} is sold out.`);
  }
  const options: SelectedOption[] = resolveOptions(product, chosen);
  const key = optionsKey(options);
  const cartId = (await getCartId(true))!;
  await db
    .insert(cartItems)
    .values({ cartId, productId, quantity, options, optionsKey: key })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.productId, cartItems.optionsKey],
      set: { quantity: sql`${cartItems.quantity} + ${quantity}` },
    });
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}

export async function setCartItemQuantity(itemId: string, quantity: number) {
  const cartId = await getCartId(false);
  if (!cartId) return;
  if (quantity <= 0) {
    await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
    return;
  }
  const [row] = await db
    .select({ product: products })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
  if (!row) return;
  const problem = quantityProblem(quantity, row.product);
  if (problem) throw new UserError(problem);
  await db.update(cartItems).set({ quantity }).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
}

export async function setCartPromo(code: string | null) {
  const cartId = await getCartId(true);
  await db.update(carts).set({ promoCode: code ? code.trim().toUpperCase() : null }).where(eq(carts.id, cartId!));
}

export async function clearCart(cartId: string) {
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  await db.update(carts).set({ promoCode: null }).where(eq(carts.id, cartId));
}

export type CartLine = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  unit: string;
  variableWeight: boolean;
  unitPrice: number;
  quantity: number;
  options: SelectedOption[];
  lineTotal: number;
  minQty: number;
  qtyStep: number;
  maxQty: number | null;
  allowDelivery: boolean;
  allowPickup: boolean;
  problem: string | null;
};

/** Priced cart for the current visitor. Pass a zone to include its delivery fee. */
export const getCart = cache(async (zoneId?: string | null) => {
  const cartId = await getCartId(false);
  const settings = await getSettings();
  const empty = {
    id: cartId,
    lines: [] as CartLine[],
    count: 0,
    promoCode: null as string | null,
    pricing: calculatePricing({ lines: [] }),
    currency: settings.commerce.currency,
  };
  if (!cartId) return empty;
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
  const rows = await db
    .select({ item: cartItems, product: products })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt));

  const user = await getCurrentUser();
  const [customer] = user ? await db.select().from(customers).where(eq(customers.userId, user.id)).limit(1) : [];

  const lines: CartLine[] = rows.map(({ item, product }) => {
    // Re-price options from the current product definition.
    const options = item.options
      .map((o) => {
        const group = product.options.find((g) => g.name === o.group);
        const choice = group?.choices.find((c) => c.label === o.choice);
        return choice ? { group: o.group, choice: o.choice, priceDelta: choice.priceDelta } : null;
      })
      .filter((o): o is SelectedOption => o !== null);
    const unitPrice = product.price + options.reduce((a, o) => a + o.priceDelta, 0);
    let problem: string | null = null;
    if (product.status !== "ACTIVE") problem = "No longer available";
    else if (product.trackInventory && !product.allowBackorder && product.availability === "IN_STOCK" && product.stockQty < item.quantity)
      problem = product.stockQty <= 0 ? "Sold out" : `Only ${product.stockQty} available`;
    return {
      id: item.id,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      image: product.images[0] ?? null,
      unit: product.unit,
      variableWeight: product.variableWeight,
      unitPrice,
      quantity: item.quantity,
      options,
      lineTotal: 0,
      minQty: product.minQty,
      qtyStep: product.qtyStep,
      maxQty: product.maxQty,
      allowDelivery: product.allowDelivery,
      allowPickup: product.allowPickup,
      problem,
      _categoryId: product.categoryId,
      _taxable: product.taxable,
    } as CartLine & { _categoryId: string | null; _taxable: boolean };
  });

  let deliveryFee = 0;
  let freeOver: number | null = null;
  if (zoneId) {
    const [zone] = await db.select().from(deliveryZones).where(eq(deliveryZones.id, zoneId));
    if (zone) {
      deliveryFee = zone.fee;
      freeOver = zone.freeOver;
    }
  }
  const promo = cart?.promoCode ? await loadPromotionByCode(cart.promoCode) : null;
  const context = customer ? await customerPromoContext(db, customer.id, promo?.id ?? null) : undefined;
  const pricing = calculatePricing({
    lines: lines.map((l) => {
      const x = l as CartLine & { _categoryId: string | null; _taxable: boolean };
      return { productId: l.productId, categoryId: x._categoryId, unitPrice: l.unitPrice, quantity: l.quantity, taxable: x._taxable };
    }),
    promotion: promo,
    deliveryFee,
    freeDeliveryOver: freeOver,
    taxRate: settings.commerce.taxRate,
    customerDiscountPercent: customer?.discountPercent ?? 0,
    context,
  });
  lines.forEach((l, i) => (l.lineTotal = pricing.lineTotals[i]!));
  if (cart?.promoCode && !promo) pricing.promotionError = "That promo code is not valid.";
  return {
    id: cartId,
    lines,
    count: lines.length,
    promoCode: cart?.promoCode ?? null,
    pricing,
    currency: settings.commerce.currency,
  };
});

export async function cartCount() {
  const cartId = await readCartId();
  if (!cartId) return 0;
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(cartItems).where(eq(cartItems.cartId, cartId));
  return row?.n ?? 0;
}
