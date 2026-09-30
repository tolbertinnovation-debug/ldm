"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, customers, orders, products } from "@/lib/db/schema";
import { fail, formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit, retryMessage } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { normalizePhone } from "@/lib/phone";
import { addToCart, clearCart, getCart, getCartId, setCartItemQuantity, setCartPromo } from "@/lib/services/cart";
import { createOrder } from "@/lib/services/orders";
import { recordPayment } from "@/lib/services/payments";
import { startCardPayment, startMomoPayment } from "@/lib/services/online-payments";
import { findOrCreateCustomer } from "@/lib/services/customers";
import { notifyAdmins, sendTemplate } from "@/lib/messaging";
import { firstName } from "@/lib/messaging/templates";
import { appUrl } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { PAYMENT_METHODS } from "@/lib/constants";
import { sql } from "drizzle-orm";

function parseOptions(formData: FormData) {
  const out: { group: string; choice: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("opt:") && typeof value === "string" && value) out.push({ group: key.slice(4), choice: value });
  }
  return out;
}

export async function addToCartAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const productId = z.uuid().parse(formData.get("productId"));
    const quantity = z.coerce.number().positive("Enter a quantity").parse(formData.get("quantity") ?? 1);
    await addToCart(productId, quantity, parseOptions(formData));
    revalidatePath("/", "layout");
    if (formData.get("buyNow") === "1") redirect("/checkout");
    return ok("Added to cart");
  });
}

export async function updateCartItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const itemId = z.uuid().parse(formData.get("itemId"));
    const quantity = z.coerce.number().min(0).parse(formData.get("quantity"));
    await setCartItemQuantity(itemId, quantity);
    revalidatePath("/", "layout");
    return ok(quantity === 0 ? "Removed from cart" : undefined);
  });
}

export async function applyPromoAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const code = String(formData.get("promoCode") ?? "").trim();
    if (formData.get("remove") === "1" || !code) {
      await setCartPromo(null);
      revalidatePath("/cart");
      revalidatePath("/checkout");
      return ok("Promo code removed");
    }
    const limited = await rateLimit(`promo:${await clientIp()}`, 20, 600);
    if (!limited.ok) return fail(retryMessage(limited.retryAfterSeconds));
    await setCartPromo(code);
    const cart = await getCart();
    if (cart.pricing.promotionError) {
      await setCartPromo(null);
      return fail(cart.pricing.promotionError, { promoCode: cart.pricing.promotionError });
    }
    revalidatePath("/cart");
    revalidatePath("/checkout");
    return ok("Promo code applied");
  });
}

const checkoutSchema = z
  .object({
    name: zf.requiredText("Your name", 120),
    phone: z.string().trim().refine((v) => !!normalizePhone(v), "Enter a valid phone number, e.g. 077 123 4567"),
    email: zf.email(),
    fulfillmentType: z.enum(["DELIVERY", "PICKUP"]),
    deliveryZoneId: zf.optionalUuid(),
    line1: zf.optionalText(200),
    area: zf.optionalText(120),
    landmark: zf.optionalText(200),
    city: zf.optionalText(80),
    lat: zf.optionalDecimal(-90, 90),
    lng: zf.optionalDecimal(-180, 180),
    pickupLocationId: zf.optionalUuid(),
    scheduledDate: zf.optionalDate(),
    timeSlot: zf.optionalText(80),
    paymentMethod: z.enum(PAYMENT_METHODS),
    momoReference: zf.optionalText(60),
    payerPhone: zf.optionalText(30),
    customerNote: zf.optionalText(1000),
    marketingOptIn: zf.checkbox(),
    website: z.string().max(0, "Spam detected").optional(), // honeypot
  })
  .superRefine((v, ctx) => {
    if (v.fulfillmentType === "DELIVERY") {
      if (!v.deliveryZoneId) ctx.addIssue({ code: "custom", path: ["deliveryZoneId"], message: "Choose your delivery area" });
      if (!v.line1) ctx.addIssue({ code: "custom", path: ["line1"], message: "Enter your street or house address" });
    }
    if (v.scheduledDate && v.scheduledDate < new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: "custom", path: ["scheduledDate"], message: "Choose today or a later date" });
    }
  });

export async function checkoutAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let trackingToken: string | null = null;
  let redirectTo: string | null = null;
  const result = await runAction(async () => {
    const ip = await clientIp();
    const limited = await rateLimit(`checkout:${ip}`, 15, 3600);
    if (!limited.ok) return fail(retryMessage(limited.retryAfterSeconds));

    const data = checkoutSchema.parse(formObject(formData));
    const settings = await getSettings();
    const user = await getCurrentUser();
    if (!user && !settings.commerce.allowGuestCheckout) redirect("/login?next=/checkout");

    const cartId = await getCartId(false);
    const cart = await getCart(data.deliveryZoneId);
    if (!cartId || cart.lines.length === 0) throw new UserError("Your cart is empty.");
    const blocked = cart.lines.find((l) => l.problem);
    if (blocked) throw new UserError(`${blocked.name}: ${blocked.problem}. Please update your cart.`);

    const jar = await cookies();
    let utm: { s?: string; m?: string; c?: string } = {};
    try {
      utm = JSON.parse(jar.get("reap_utm")?.value ?? "{}");
    } catch {
      utm = {};
    }

    const needsRef = data.paymentMethod === "ORANGE_MONEY" || (data.paymentMethod === "MTN_MOMO" && !process.env.MTN_MOMO_API_KEY);
    const order = await createOrder({
      items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, options: l.options.map((o) => ({ group: o.group, choice: o.choice })) })),
      customer: { name: data.name, phone: data.phone, email: data.email, userId: user?.role === "CUSTOMER" ? user.id : null },
      fulfillmentType: data.fulfillmentType,
      deliveryZoneId: data.deliveryZoneId,
      address:
        data.fulfillmentType === "DELIVERY"
          ? { recipientName: data.name, phone: data.phone, line1: data.line1!, area: data.area, city: data.city ?? "Monrovia", landmark: data.landmark, lat: data.lat, lng: data.lng }
          : null,
      pickupLocationId: data.pickupLocationId,
      scheduledDate: data.scheduledDate,
      timeSlot: data.timeSlot,
      paymentMethod: data.paymentMethod,
      promoCode: cart.promoCode,
      customerNote: data.customerNote,
      channel: "WEB",
      utm: { source: utm.s ?? null, medium: utm.m ?? null, campaign: utm.c ?? null },
    });
    trackingToken = order.trackingToken;
    await clearCart(cartId);

    if (data.marketingOptIn) {
      await db
        .update(customers)
        .set({ marketingWhatsapp: true, marketingSms: true, marketingEmail: !!data.email })
        .where(eq(customers.id, order.customerId));
    }

    // Customer-submitted mobile money transfer → pending payment for staff to verify.
    if (needsRef && data.momoReference) {
      await recordPayment({
        orderId: order.id,
        amount: order.total,
        method: data.paymentMethod,
        status: "PENDING",
        providerRef: data.momoReference,
        payerPhone: data.payerPhone ?? data.phone,
        note: "Submitted by customer at checkout",
        notify: false,
      });
    }
    if (data.paymentMethod === "MTN_MOMO" && process.env.MTN_MOMO_API_KEY) {
      try {
        await startMomoPayment(order.id, data.payerPhone || data.phone);
      } catch (err) {
        console.error("MoMo prompt failed", err);
      }
    }
    if (data.paymentMethod === "CARD") {
      try {
        redirectTo = await startCardPayment(order.id);
      } catch (err) {
        console.error("Card checkout failed", err);
      }
    }
    revalidatePath("/", "layout");
    return ok("Order placed!");
  });
  if (result.ok && redirectTo) redirect(redirectTo);
  if (result.ok && trackingToken) redirect(`/track/${trackingToken}?placed=1`);
  return result;
}

export async function trackLookupAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let token: string | null = null;
  const res = await runAction(async () => {
    const limited = await rateLimit(`track:${await clientIp()}`, 30, 600);
    if (!limited.ok) return fail(retryMessage(limited.retryAfterSeconds));
    const number = String(formData.get("number") ?? "").trim().toUpperCase();
    const phone = normalizePhone(String(formData.get("phone") ?? ""));
    if (!number || !phone) return fail("Enter your order number and phone number.", { number: !number ? "Required" : "", phone: !phone ? "Enter a valid phone" : "" });
    const withPrefix = /^\d+$/.test(number) ? `${(await getSettings()).commerce.orderPrefix}-${number}` : number;
    const [order] = await db.select({ token: orders.trackingToken, phone: orders.contactPhone }).from(orders).where(eq(orders.number, withPrefix)).limit(1);
    if (!order || order.phone !== phone) return fail("We couldn't find an order with those details.");
    token = order.token;
    return ok();
  });
  if (token) redirect(`/track/${token}`);
  return res;
}

export async function payOrderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let redirectTo: string | null = null;
  const res = await runAction(async () => {
    const token = String(formData.get("token") ?? "");
    const method = z.enum(["ORANGE_MONEY", "MTN_MOMO", "CARD"]).parse(formData.get("method"));
    const [order] = await db.select().from(orders).where(eq(orders.trackingToken, token)).limit(1);
    if (!order) throw new UserError("Order not found.");
    const due = order.total - order.amountPaid;
    if (due <= 0) return ok("This order is already paid.");
    if (method === "CARD") {
      redirectTo = await startCardPayment(order.id);
      return ok();
    }
    if (method === "MTN_MOMO" && process.env.MTN_MOMO_API_KEY) {
      await startMomoPayment(order.id, String(formData.get("payerPhone") || order.contactPhone));
      revalidatePath(`/track/${token}`);
      return ok("Check your phone to approve the MTN MoMo payment.");
    }
    const ref = z.string().trim().min(4, "Enter the transaction ID from your SMS").max(60).parse(formData.get("reference"));
    const limited = await rateLimit(`payref:${order.id}`, 5, 3600);
    if (!limited.ok) return fail(retryMessage(limited.retryAfterSeconds));
    await recordPayment({ orderId: order.id, amount: due, method, status: "PENDING", providerRef: ref, payerPhone: normalizePhone(String(formData.get("payerPhone") ?? "")) ?? order.contactPhone, note: "Submitted by customer", notify: false });
    revalidatePath(`/track/${token}`);
    return ok("Thank you! We will confirm your payment shortly.");
  });
  if (redirectTo) redirect(redirectTo);
  return res;
}

const bookingSchema = z.object({
  serviceId: z.uuid(),
  name: zf.requiredText("Your name", 120),
  phone: z.string().trim().refine((v) => !!normalizePhone(v), "Enter a valid phone number"),
  email: zf.email(),
  preferredDate: zf.optionalDate(),
  preferredTime: zf.optionalText(40),
  participants: z.coerce.number().int().min(1).max(500).default(1),
  location: zf.optionalText(200),
  details: zf.optionalText(2000),
  website: z.string().max(0).optional(),
});

export async function bookServiceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const limited = await rateLimit(`booking:${await clientIp()}`, 8, 3600);
    if (!limited.ok) return fail(retryMessage(limited.retryAfterSeconds));
    const data = bookingSchema.parse(formObject(formData));
    const [service] = await db.select().from(products).where(eq(products.id, data.serviceId));
    if (!service || service.type !== "SERVICE" || service.status !== "ACTIVE") throw new UserError("This service is not available.");
    const user = await getCurrentUser();
    const settings = await getSettings();
    const result = await db.transaction(async (tx) => {
      const customer = await findOrCreateCustomer(tx, { name: data.name, phone: data.phone, email: data.email, userId: user?.role === "CUSTOMER" ? user.id : null, source: "Service booking" });
      const seq = await tx.execute<{ n: string }>(sql`select nextval('booking_number_seq')::text as n`);
      const number = `BK-${seq.rows[0]!.n}`;
      await tx.insert(bookings).values({
        number,
        serviceId: service.id,
        serviceName: service.name,
        customerId: customer.id,
        contactName: data.name,
        contactPhone: customer.phone!,
        contactEmail: data.email,
        preferredDate: data.preferredDate,
        preferredTime: data.preferredTime,
        participants: data.participants,
        location: data.location,
        details: data.details,
        quotedAmount: service.price > 0 ? service.price * data.participants : null,
      });
      return { number, customer };
    });
    await sendTemplate(
      "booking.received",
      { phone: result.customer.phone, email: result.customer.email, preferredChannel: result.customer.preferredChannel, customerId: result.customer.id },
      { firstName: firstName(data.name), service: service.name, bookingNumber: result.number },
    );
    if (settings.notifications.notifyNewBooking) {
      await notifyAdmins("admin.new_booking", { bookingNumber: result.number, service: service.name, customerName: data.name, customerPhone: result.customer.phone, adminUrl: appUrl("/admin/bookings") });
    }
    return ok(`Request received! Your reference is ${result.number}. We will call you to confirm.`, { number: result.number });
  });
}
