import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import {
  campaigns,
  customers,
  deliveries,
  deliveryZones,
  orderEvents,
  orderItems,
  orders,
  pickupLocations,
  products,
  promotions,
  users,
  type AddressSnapshot,
  type SelectedOption,
} from "@/lib/db/schema";
import { UserError } from "@/lib/errors";
import { formatMoney, lineTotal } from "@/lib/money";
import { canTransition, paymentStatusFor } from "@/lib/order-status";
import { calculatePricing, quantityProblem, type PricingLine, type PromotionRule } from "@/lib/pricing";
import { appUrl } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { randomToken } from "@/lib/crypto";
import { kickJobs } from "@/lib/jobs/queue";
import { notifyAdmins, sendTemplate } from "@/lib/messaging";
import { firstName } from "@/lib/messaging/templates";
import { ORDER_STATUS_META, type OrderStatus, type PaymentMethod } from "@/lib/constants";
import { adjustStock, StockError } from "./inventory";
import { findOrCreateCustomer, refreshCustomerStats } from "./customers";

export type OrderItemInput = { productId: string; quantity: number; options?: { group: string; choice: string }[] };

export type CreateOrderInput = {
  items: OrderItemInput[];
  customer: { name: string; phone: string; email?: string | null; userId?: string | null; customerId?: string | null };
  fulfillmentType: "DELIVERY" | "PICKUP";
  deliveryZoneId?: string | null;
  address?: AddressSnapshot | null;
  pickupLocationId?: string | null;
  scheduledDate?: string | null;
  timeSlot?: string | null;
  paymentMethod?: PaymentMethod | null;
  promoCode?: string | null;
  customerNote?: string | null;
  internalNote?: string | null;
  channel?: (typeof orders.$inferInsert)["channel"];
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
  placedById?: string | null;
  /** Staff (POS) may sell past stock, override delivery fee and skip min order. */
  staffOverride?: { allowOversell?: boolean; deliveryFee?: number | null; initialStatus?: OrderStatus };
};

export async function loadPromotionByCode(code: string, tx: Tx | typeof db = db): Promise<PromotionRule & { campaignId: string | null } | null> {
  const [p] = await tx
    .select()
    .from(promotions)
    .where(eq(promotions.code, code.trim().toUpperCase()))
    .limit(1);
  return p ?? null;
}

/** Resolves chosen options against the product definition (never trusts client prices). */
export function resolveOptions(
  product: { name: string; options: { name: string; required: boolean; choices: { label: string; priceDelta: number }[] }[] },
  chosen: { group: string; choice: string }[] = [],
): SelectedOption[] {
  const out: SelectedOption[] = [];
  for (const group of product.options) {
    const pick = chosen.find((c) => c.group === group.name);
    if (!pick || !pick.choice) {
      if (group.required) throw new UserError(`Choose ${group.name.toLowerCase()} for ${product.name}.`);
      continue;
    }
    const choice = group.choices.find((c) => c.label === pick.choice);
    if (!choice) throw new UserError(`Invalid ${group.name.toLowerCase()} for ${product.name}.`);
    out.push({ group: group.name, choice: choice.label, priceDelta: choice.priceDelta });
  }
  return out;
}

async function nextOrderNumber(tx: Tx, prefix: string) {
  const res = await tx.execute<{ n: string }>(sql`select nextval('order_number_seq')::text as n`);
  return `${prefix}-${res.rows[0]!.n}`;
}

export async function customerPromoContext(tx: Tx | typeof db, customerId: string | null, promotionId: string | null) {
  if (!customerId) return { customerOrderCount: 0, customerRedemptions: 0 };
  const [row] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      redemptions: promotionId
        ? sql<number>`count(*) filter (where ${orders.promotionId} = ${promotionId})::int`
        : sql<number>`0`,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), ne(orders.status, "CANCELLED")));
  return { customerOrderCount: row?.count ?? 0, customerRedemptions: row?.redemptions ?? 0 };
}

/**
 * Places an order atomically: validates products/options/quantities, prices
 * server-side, reserves stock, records events, and queues notifications.
 */
export async function createOrder(input: CreateOrderInput) {
  if (!input.items.length) throw new UserError("Your cart is empty.");
  const settings = await getSettings();
  const commerce = settings.commerce;

  if (input.fulfillmentType === "DELIVERY" && !commerce.deliveryEnabled && !input.placedById) throw new UserError("Delivery is currently unavailable.");
  if (input.fulfillmentType === "PICKUP" && !commerce.pickupEnabled && !input.placedById) throw new UserError("Pickup is currently unavailable.");

  const result = await db.transaction(async (tx) => {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const rows = await tx.select().from(products).where(inArray(products.id, ids));
    const byId = new Map(rows.map((p) => [p.id, p]));

    const lines: (PricingLine & { product: (typeof rows)[number]; options: SelectedOption[] })[] = [];
    for (const item of input.items) {
      const product = byId.get(item.productId);
      if (!product || product.status !== "ACTIVE" || product.type !== "PRODUCT") {
        throw new UserError("One of the items is no longer available. Please review your cart.");
      }
      const problem = quantityProblem(item.quantity, product);
      if (problem) throw new UserError(`${product.name}: ${problem}`);
      if (input.fulfillmentType === "DELIVERY" && !product.allowDelivery)
        throw new UserError(`${product.name} is available for pickup only.`);
      if (input.fulfillmentType === "PICKUP" && !product.allowPickup)
        throw new UserError(`${product.name} is available for delivery only.`);
      const options = resolveOptions(product, item.options);
      const unitPrice = product.price + options.reduce((a, o) => a + o.priceDelta, 0);
      lines.push({ productId: product.id, categoryId: product.categoryId, unitPrice, quantity: item.quantity, taxable: product.taxable, product, options });
    }

    // Fulfilment details
    let deliveryFee = 0;
    let freeDeliveryOver: number | null = null;
    let zoneId: string | null = null;
    let pickupId: string | null = null;
    if (input.fulfillmentType === "DELIVERY") {
      if (!input.address?.line1) throw new UserError("Enter a delivery address.", { line1: "Required" });
      if (input.deliveryZoneId) {
        const [zone] = await tx.select().from(deliveryZones).where(eq(deliveryZones.id, input.deliveryZoneId)).limit(1);
        if (!zone || (!zone.active && !input.placedById)) throw new UserError("Choose a delivery area.", { deliveryZoneId: "Required" });
        zoneId = zone.id;
        deliveryFee = zone.fee;
        freeDeliveryOver = zone.freeOver;
      } else if (!input.placedById) {
        throw new UserError("Choose a delivery area.", { deliveryZoneId: "Required" });
      }
    } else {
      const [loc] = input.pickupLocationId
        ? await tx.select().from(pickupLocations).where(eq(pickupLocations.id, input.pickupLocationId)).limit(1)
        : await tx.select().from(pickupLocations).where(eq(pickupLocations.active, true)).limit(1);
      pickupId = loc?.id ?? null;
    }
    if (input.staffOverride?.deliveryFee !== undefined && input.staffOverride.deliveryFee !== null) {
      deliveryFee = input.staffOverride.deliveryFee;
    }

    const customer = input.customer.customerId
      ? await (async () => {
          const [c] = await tx.select().from(customers).where(eq(customers.id, input.customer.customerId!)).limit(1);
          if (!c) throw new UserError("Customer not found.");
          return c;
        })()
      : await findOrCreateCustomer(tx, {
          name: input.customer.name,
          phone: input.customer.phone,
          email: input.customer.email,
          userId: input.customer.userId,
          source: input.utm?.source ?? (input.channel === "WEB" || !input.channel ? "Website" : undefined),
        });

    // Promotion
    let promo: Awaited<ReturnType<typeof loadPromotionByCode>> = null;
    if (input.promoCode?.trim()) {
      promo = await loadPromotionByCode(input.promoCode, tx);
      if (!promo) throw new UserError("That promo code is not valid.", { promoCode: "Invalid code" });
    }
    const context = await customerPromoContext(tx, customer.id, promo?.id ?? null);
    const pricing = calculatePricing({
      lines,
      promotion: promo,
      deliveryFee: input.fulfillmentType === "DELIVERY" ? deliveryFee : 0,
      freeDeliveryOver: input.staffOverride?.deliveryFee != null ? null : freeDeliveryOver,
      taxRate: commerce.taxRate,
      customerDiscountPercent: customer.discountPercent,
      context,
    });
    if (promo && pricing.promotionError) throw new UserError(pricing.promotionError, { promoCode: pricing.promotionError });
    if (!input.placedById && commerce.minOrderAmount > 0 && pricing.subtotal < commerce.minOrderAmount) {
      throw new UserError(`The minimum order is ${formatMoney(commerce.minOrderAmount, commerce.currency)}.`);
    }

    // Atomically count promo usage, respecting the global limit under concurrency.
    if (promo && pricing.promotionApplied) {
      const updated = await tx
        .update(promotions)
        .set({ usageCount: sql`${promotions.usageCount} + 1` })
        .where(and(eq(promotions.id, promo.id), sql`(${promotions.usageLimit} is null or ${promotions.usageCount} < ${promotions.usageLimit})`))
        .returning({ id: promotions.id });
      if (!updated.length) throw new UserError("This promo code has been fully used.", { promoCode: "Fully used" });
    }

    // Campaign attribution: explicit UTM first, then the promo's campaign.
    let campaignId: string | null = null;
    if (input.utm?.campaign) {
      const [c] = await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.utmCampaign, input.utm.campaign)).limit(1);
      campaignId = c?.id ?? null;
    }
    if (!campaignId && promo?.campaignId && pricing.promotionApplied) campaignId = promo.campaignId;

    const number = await nextOrderNumber(tx, commerce.orderPrefix || "ORD");
    const initialStatus = input.staffOverride?.initialStatus ?? "PENDING";
    const [order] = await tx
      .insert(orders)
      .values({
        number,
        customerId: customer.id,
        status: initialStatus,
        fulfillmentType: input.fulfillmentType,
        channel: input.channel ?? "WEB",
        contactName: input.customer.name || customer.name,
        contactPhone: customer.phone ?? input.customer.phone,
        contactEmail: input.customer.email ?? customer.email,
        deliveryZoneId: zoneId,
        deliveryAddress: input.fulfillmentType === "DELIVERY" ? input.address ?? null : null,
        pickupLocationId: pickupId,
        scheduledDate: input.scheduledDate ?? null,
        timeSlot: input.timeSlot ?? null,
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        deliveryFee: pricing.deliveryFee,
        taxTotal: pricing.taxTotal,
        total: pricing.total,
        paymentStatus: pricing.total === 0 ? "PAID" : "UNPAID",
        paymentMethod: input.paymentMethod ?? null,
        promotionId: pricing.promotionApplied ? promo?.id ?? null : null,
        promoCode: pricing.promotionApplied ? promo?.code ?? null : null,
        customerNote: input.customerNote ?? null,
        internalNote: input.internalNote ?? null,
        utmSource: input.utm?.source ?? null,
        utmMedium: input.utm?.medium ?? null,
        utmCampaign: input.utm?.campaign ?? null,
        campaignId,
        trackingToken: randomToken(18),
        placedById: input.placedById ?? null,
        confirmedAt: initialStatus !== "PENDING" ? new Date() : null,
        completedAt: initialStatus === "COMPLETED" ? new Date() : null,
      })
      .returning();

    await tx.insert(orderItems).values(
      lines.map((l, i) => ({
        orderId: order!.id,
        productId: l.productId,
        name: l.product.name,
        sku: l.product.sku,
        unit: l.product.unit,
        variableWeight: l.product.variableWeight,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        options: l.options,
        lineTotal: pricing.lineTotals[i]!,
        unitCost: l.product.costPrice,
      })),
    );

    for (const l of lines) {
      try {
        await adjustStock(tx, {
          productId: l.productId,
          delta: -l.quantity,
          type: "SALE",
          reference: number,
          orderId: order!.id,
          actorId: input.placedById ?? null,
          enforceAvailable: !input.staffOverride?.allowOversell && l.product.availability === "IN_STOCK",
        });
      } catch (err) {
        if (err instanceof StockError) throw new UserError(err.message);
        throw err;
      }
    }

    await tx.insert(orderEvents).values({
      orderId: order!.id,
      type: "STATUS",
      status: initialStatus,
      message: input.placedById ? `Order created by staff (${input.channel ?? "WEB"})` : "Order placed online",
      isPublic: true,
      actorId: input.placedById ?? null,
    });

    if (input.fulfillmentType === "DELIVERY") {
      await tx.insert(deliveries).values({ orderId: order!.id });
    }

    if (settings.notifications.customerOrderUpdates) {
      await sendTemplate(
        "order.placed",
        { phone: customer.phone, email: customer.email, preferredChannel: customer.preferredChannel, customerId: customer.id },
        {
          firstName: firstName(order!.contactName),
          orderNumber: number,
          total: formatMoney(order!.total, commerce.currency),
          trackUrl: appUrl(`/track/${order!.trackingToken}`),
        },
        { orderId: order!.id, tx },
      );
    }
    await refreshCustomerStats(customer.id, tx);
    return { order: order!, customer };
  });

  kickJobs();
  if (settings.notifications.notifyNewOrder && !input.placedById) {
    await notifyAdmins("admin.new_order", {
      orderNumber: result.order.number,
      total: formatMoney(result.order.total, commerce.currency),
      fulfilment: result.order.fulfillmentType === "DELIVERY" ? "delivery" : "pickup",
      customerName: result.order.contactName,
      customerPhone: result.order.contactPhone,
      adminUrl: appUrl(`/admin/orders/${result.order.id}`),
    }).catch((err) => console.error("admin notify failed", err));
  }
  return result.order;
}

const STATUS_TEMPLATE: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "order.confirmed",
  READY: "order.ready",
  OUT_FOR_DELIVERY: "order.out_for_delivery",
  COMPLETED: "order.completed",
  CANCELLED: "order.cancelled",
};

/** Moves an order through its lifecycle with side effects (stock, delivery, messages). */
export async function updateOrderStatus(
  orderId: string,
  next: OrderStatus,
  actor: { id: string; name: string } | null,
  opts: { note?: string | null; reason?: string | null; notify?: boolean } = {},
) {
  const settings = await getSettings();
  const updated = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new UserError("Order not found.");
    if (order.status === next) return order;
    if (!canTransition(order.status, next, order.fulfillmentType)) {
      throw new UserError(`Cannot move an order from ${ORDER_STATUS_META[order.status].label} to ${ORDER_STATUS_META[next].label}.`);
    }
    const now = new Date();
    const patch: Partial<typeof orders.$inferInsert> = { status: next };
    if (next === "CONFIRMED" && !order.confirmedAt) patch.confirmedAt = now;
    if (next === "COMPLETED") patch.completedAt = now;
    if (next === "CANCELLED") {
      patch.cancelledAt = now;
      patch.cancelReason = opts.reason ?? null;
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      for (const item of items) {
        if (!item.productId) continue;
        await adjustStock(tx, { productId: item.productId, delta: item.quantity, type: "RETURN", reference: `${order.number} cancelled`, orderId, actorId: actor?.id });
      }
      if (order.promotionId) {
        await tx.update(promotions).set({ usageCount: sql`greatest(${promotions.usageCount} - 1, 0)` }).where(eq(promotions.id, order.promotionId));
      }
    }
    const [saved] = await tx.update(orders).set(patch).where(eq(orders.id, orderId)).returning();

    // Keep the delivery record in step with the order.
    if (order.fulfillmentType === "DELIVERY") {
      const deliveryPatch: Partial<typeof deliveries.$inferInsert> =
        next === "OUT_FOR_DELIVERY"
          ? { status: "IN_TRANSIT", pickedUpAt: now }
          : next === "COMPLETED"
            ? { status: "DELIVERED", deliveredAt: now }
            : next === "CANCELLED"
              ? { status: "FAILED", failedReason: opts.reason ?? "Order cancelled" }
              : {};
      if (Object.keys(deliveryPatch).length) await tx.update(deliveries).set(deliveryPatch).where(eq(deliveries.orderId, orderId));
    }

    const label = next === "COMPLETED" ? (order.fulfillmentType === "DELIVERY" ? "Delivered" : "Picked up") : ORDER_STATUS_META[next].label;
    await tx.insert(orderEvents).values({
      orderId,
      type: "STATUS",
      status: next,
      message: [label, opts.reason, opts.note].filter(Boolean).join(" — "),
      isPublic: true,
      actorId: actor?.id ?? null,
    });

    const template = STATUS_TEMPLATE[next];
    if (template && opts.notify !== false && settings.notifications.customerOrderUpdates) {
      const [driver] =
        next === "OUT_FOR_DELIVERY"
          ? await tx
              .select({ name: users.name, phone: users.phone })
              .from(deliveries)
              .leftJoin(users, eq(users.id, deliveries.driverId))
              .where(eq(deliveries.orderId, orderId))
          : [];
      const [loc] = saved!.pickupLocationId
        ? await tx.select().from(pickupLocations).where(eq(pickupLocations.id, saved!.pickupLocationId))
        : [];
      const [customer] = await tx.select().from(customers).where(eq(customers.id, saved!.customerId));
      const balance = Math.max(0, saved!.total - saved!.amountPaid);
      await sendTemplate(
        template,
        { phone: saved!.contactPhone, email: saved!.contactEmail, preferredChannel: customer?.preferredChannel, customerId: saved!.customerId },
        {
          firstName: firstName(saved!.contactName),
          orderNumber: saved!.number,
          trackUrl: appUrl(`/track/${saved!.trackingToken}`),
          balance: formatMoney(balance, settings.commerce.currency),
          pickupLocation: loc?.name ?? settings.business.address,
          driverName: driver?.name ?? "our driver",
          driverPhone: driver?.phone ?? settings.business.phone,
          reason: opts.reason ? `Reason: ${opts.reason}.` : "",
          fulfilmentLine:
            saved!.fulfillmentType === "DELIVERY"
              ? `We will deliver${saved!.scheduledDate ? ` on ${saved!.scheduledDate}` : " soon"}${saved!.timeSlot ? `, ${saved!.timeSlot}` : ""}.`
              : `Pick up at ${loc?.name ?? settings.business.address}${saved!.scheduledDate ? ` on ${saved!.scheduledDate}` : ""}.`,
        },
        { orderId, tx },
      );
    }
    await refreshCustomerStats(saved!.customerId, tx);
    return saved!;
  });
  kickJobs();
  return updated;
}

/**
 * Sets the actual weighed quantity for a line (meat by the pound, live fish by
 * the kilo) and re-totals the order. Discounts and tax scale proportionally.
 */
export async function setItemQuantity(orderId: string, itemId: string, quantity: number, actor: { id: string; name: string }) {
  if (!(quantity > 0)) throw new UserError("Quantity must be greater than zero.");
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new UserError("Order not found.");
    if (order.status === "COMPLETED" || order.status === "CANCELLED") throw new UserError("This order can no longer be edited.");
    const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
    if (!item) throw new UserError("Item not found.");
    const delta = quantity - item.quantity;
    if (delta === 0) return order;
    const newLine = lineTotal(item.unitPrice, quantity);
    await tx.update(orderItems).set({ quantity, lineTotal: newLine }).where(eq(orderItems.id, itemId));
    if (item.productId) {
      await adjustStock(tx, { productId: item.productId, delta: -delta, type: delta > 0 ? "SALE" : "RETURN", reference: `${order.number} weight adj.`, orderId, actorId: actor.id });
    }
    const subtotal = order.subtotal - item.lineTotal + newLine;
    const ratio = order.subtotal > 0 ? subtotal / order.subtotal : 1;
    const discountTotal = Math.min(subtotal, Math.round(order.discountTotal * ratio));
    const taxTotal = Math.round(order.taxTotal * ratio);
    const total = subtotal - discountTotal + order.deliveryFee + taxTotal;
    const [saved] = await tx
      .update(orders)
      .set({ subtotal, discountTotal, taxTotal, total, paymentStatus: paymentStatusFor(total, order.amountPaid) })
      .where(eq(orders.id, orderId))
      .returning();
    await tx.insert(orderEvents).values({
      orderId,
      type: "EDIT",
      message: `${item.name}: quantity ${item.quantity} → ${quantity} (weighed). New total ${formatMoney(total)}.`,
      isPublic: false,
      actorId: actor.id,
    });
    await refreshCustomerStats(order.customerId, tx);
    return saved!;
  });
}

export async function addOrderNote(orderId: string, message: string, actor: { id: string }, isPublic = false) {
  await db.insert(orderEvents).values({ orderId, type: "NOTE", message, isPublic, actorId: actor.id });
}
