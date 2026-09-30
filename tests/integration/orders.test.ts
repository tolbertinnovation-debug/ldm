import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { createOrder, setItemQuantity, updateOrderStatus } from "@/lib/services/orders";
import { recordPayment, settlePayment } from "@/lib/services/payments";
import { createInvoiceFromOrder } from "@/lib/services/invoices";
import { audienceCount } from "@/lib/services/audience";
import { processJobs } from "@/lib/jobs/runner";
import { resetDatabase, seedBasics } from "./helpers";

let data: Awaited<ReturnType<typeof seedBasics>>;
const actor = { id: "00000000-0000-0000-0000-000000000000", name: "Test" };

beforeEach(async () => {
  await resetDatabase();
  data = await seedBasics();
  const [u] = await db.insert(s.users).values({ id: actor.id, name: "Test", email: "t@example.com", role: "OWNER" }).returning();
  void u;
});

afterAll(async () => {
  await closeDb();
});

const customer = { name: "Musu Kollie", phone: "077 012 3456" };

describe("createOrder", () => {
  it("prices server-side, reserves stock, creates the customer and queues a confirmation", async () => {
    const order = await createOrder({
      items: [
        { productId: data.chops.id, quantity: 2.5 },
        { productId: data.pig.id, quantity: 1, options: [{ group: "Processing", choice: "Slaughter & clean" }] },
      ],
      customer,
      fulfillmentType: "DELIVERY",
      deliveryZoneId: data.zone.id,
      address: { line1: "12 Duport Road" },
      paymentMethod: "CASH",
    });
    expect(order.number).toBe("REAP-10001");
    expect(order.subtotal).toBe(1125 + 28000);
    expect(order.deliveryFee).toBe(0); // free over $100
    expect(order.total).toBe(29125);

    const [chops] = await db.select().from(s.products).where(eq(s.products.id, data.chops.id));
    expect(chops!.stockQty).toBe(17.5);
    const [c] = await db.select().from(s.customers).where(eq(s.customers.phone, "+231770123456"));
    expect(c!.ordersCount).toBe(1);
    expect(c!.totalSpent).toBe(29125);
    const msgs = await db.select().from(s.messages).where(eq(s.messages.orderId, order.id));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.body).toContain("REAP-10001");
    const [delivery] = await db.select().from(s.deliveries).where(eq(s.deliveries.orderId, order.id));
    expect(delivery!.status).toBe("UNASSIGNED");

    // Queued message is delivered by the job runner (log provider in tests).
    await processJobs();
    const [sent] = await db.select().from(s.messages).where(eq(s.messages.orderId, order.id));
    expect(sent!.status).toBe("SENT");
  });

  it("refuses to oversell and rolls back everything", async () => {
    await expect(
      createOrder({ items: [{ productId: data.chops.id, quantity: 1 }, { productId: data.pig.id, quantity: 3, options: [{ group: "Processing", choice: "Live" }] }], customer, fulfillmentType: "PICKUP" }),
    ).rejects.toThrow(/Only 2 left/);
    const [chops] = await db.select().from(s.products).where(eq(s.products.id, data.chops.id));
    expect(chops!.stockQty).toBe(20);
    expect(await db.select().from(s.orders)).toHaveLength(0);
  });

  it("validates required options, quantity steps and fulfilment rules", async () => {
    await expect(createOrder({ items: [{ productId: data.pig.id, quantity: 1 }], customer, fulfillmentType: "PICKUP" })).rejects.toThrow(/Choose processing/);
    await expect(createOrder({ items: [{ productId: data.chops.id, quantity: 1.25 }], customer, fulfillmentType: "PICKUP" })).rejects.toThrow(/steps/);
    await expect(createOrder({ items: [{ productId: data.tilapia.id, quantity: 1 }], customer, fulfillmentType: "DELIVERY", deliveryZoneId: data.zone.id, address: { line1: "x" } })).rejects.toThrow(/pickup only/);
  });

  it("applies a promo once and enforces its usage limit", async () => {
    const first = await createOrder({ items: [{ productId: data.chops.id, quantity: 4 }], customer, fulfillmentType: "PICKUP", promoCode: "welcome10" });
    expect(first.discountTotal).toBe(180);
    expect(first.promoCode).toBe("WELCOME10");
    await expect(createOrder({ items: [{ productId: data.chops.id, quantity: 4 }], customer: { name: "Other", phone: "0880000001" }, fulfillmentType: "PICKUP", promoCode: "WELCOME10" })).rejects.toThrow(/fully used/);
  });
});

describe("order lifecycle & money", () => {
  it("cancelling restocks and releases the promo", async () => {
    const order = await createOrder({ items: [{ productId: data.chops.id, quantity: 4 }], customer, fulfillmentType: "PICKUP", promoCode: "WELCOME10" });
    await updateOrderStatus(order.id, "CANCELLED", actor, { reason: "Changed mind" });
    const [chops] = await db.select().from(s.products).where(eq(s.products.id, data.chops.id));
    expect(chops!.stockQty).toBe(20);
    const [promo] = await db.select().from(s.promotions).where(eq(s.promotions.id, data.promo.id));
    expect(promo!.usageCount).toBe(0);
    await expect(updateOrderStatus(order.id, "CONFIRMED", actor)).rejects.toThrow(/Cannot move/);
  });

  it("re-totals weighed items and tracks partial payments, verification and refunds", async () => {
    const order = await createOrder({ items: [{ productId: data.chops.id, quantity: 4 }], customer, fulfillmentType: "PICKUP" });
    const [item] = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id));
    const updated = await setItemQuantity(order.id, item!.id, 4.5, actor);
    expect(updated.total).toBe(2025);
    const [chops] = await db.select().from(s.products).where(eq(s.products.id, data.chops.id));
    expect(chops!.stockQty).toBe(15.5);

    await recordPayment({ orderId: order.id, amount: 1000, method: "CASH", actor, notify: false });
    let [o] = await db.select().from(s.orders).where(eq(s.orders.id, order.id));
    expect(o!.paymentStatus).toBe("PARTIALLY_PAID");

    const pending = await recordPayment({ orderId: order.id, amount: 1025, method: "ORANGE_MONEY", status: "PENDING", providerRef: "OM123", notify: false });
    [o] = await db.select().from(s.orders).where(eq(s.orders.id, order.id));
    expect(o!.amountPaid).toBe(1000);
    await settlePayment(pending.id, "SUCCEEDED", actor);
    [o] = await db.select().from(s.orders).where(eq(s.orders.id, order.id));
    expect(o!.paymentStatus).toBe("PAID");
    expect(o!.amountPaid).toBe(2025);
    // Settling twice is a no-op
    expect(await settlePayment(pending.id, "SUCCEEDED", actor)).toBeNull();

    await recordPayment({ orderId: order.id, amount: 2025, method: "CASH", kind: "REFUND", actor, notify: false });
    [o] = await db.select().from(s.orders).where(eq(s.orders.id, order.id));
    expect(o!.paymentStatus).toBe("REFUNDED");
  });

  it("creates an invoice from an order that stays in sync with payments", async () => {
    const order = await createOrder({ items: [{ productId: data.chops.id, quantity: 2 }], customer, fulfillmentType: "DELIVERY", deliveryZoneId: data.zone.id, address: { line1: "x" } });
    const invoiceId = await createInvoiceFromOrder(order.id, actor.id);
    expect(await createInvoiceFromOrder(order.id, actor.id)).toBe(invoiceId); // idempotent
    let [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    expect(inv!.total).toBe(order.total);
    const items = await db.select().from(s.invoiceItems).where(eq(s.invoiceItems.invoiceId, invoiceId));
    expect(items.map((i) => i.description)).toEqual(["Pork Chops", "Delivery"]);
    await recordPayment({ orderId: order.id, amount: order.total, method: "MTN_MOMO", notify: false });
    [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    expect(inv!.status).toBe("PAID");
    expect(inv!.amountPaid).toBe(order.total);
  });

  it("only includes opted-in customers in marketing audiences", async () => {
    await createOrder({ items: [{ productId: data.chops.id, quantity: 1 }], customer, fulfillmentType: "PICKUP" });
    expect(await audienceCount({}, "WHATSAPP")).toBe(0);
    await db.update(s.customers).set({ marketingWhatsapp: true });
    expect(await audienceCount({ orderedWithinDays: 7 }, "WHATSAPP")).toBe(1);
    expect(await audienceCount({ notOrderedWithinDays: 7 }, "WHATSAPP")).toBe(0);
    expect(await audienceCount({}, "EMAIL")).toBe(0);
  });
});
