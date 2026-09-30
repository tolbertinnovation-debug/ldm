import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { CheckCircle2, Circle, Clock, MapPin, Navigation, Phone, PartyPopper, Receipt, Store, Truck, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { deliveries, deliveryZones, orderEvents, orderItems, orders, payments, pickupLocations, users } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { currentStepIndex, trackingSteps } from "@/lib/order-status";
import { formatQuantity, ORDER_STATUS_META, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META } from "@/lib/constants";
import { flutterwaveConfigured, momoConfigured } from "@/lib/payments/gateways";
import { Alert, Badge, Card, cn } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { PayForm } from "@/components/shop/track-forms";
import { SocialIcon } from "@/components/shop/visuals";
import { formatDateTime, landmarkText } from "@/lib/format";

export const metadata = { title: "Order status", robots: { index: false } };

export default async function OrderTrackingPage(props: PageProps<"/track/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  if (!/^[\w-]{10,64}$/.test(token)) notFound();
  const [order] = await db.select().from(orders).where(eq(orders.trackingToken, token)).limit(1);
  if (!order) notFound();

  const [settings, items, events, [delivery], [pickup], [zone], pendingPayments] = await Promise.all([
    getSettings(),
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(orderEvents).where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.isPublic, true))).orderBy(asc(orderEvents.createdAt)),
    db
      .select({ d: deliveries, driverName: users.name, driverPhone: users.phone })
      .from(deliveries)
      .leftJoin(users, eq(users.id, deliveries.driverId))
      .where(eq(deliveries.orderId, order.id)),
    order.pickupLocationId ? db.select().from(pickupLocations).where(eq(pickupLocations.id, order.pickupLocationId)) : Promise.resolve([]),
    order.deliveryZoneId ? db.select().from(deliveryZones).where(eq(deliveryZones.id, order.deliveryZoneId)) : Promise.resolve([]),
    db.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.status, "PENDING"))),
  ]);
  const cur = settings.commerce.currency;
  const steps = trackingSteps(order.fulfillmentType);
  const idx = currentStepIndex(order.status);
  const cancelled = order.status === "CANCELLED";
  const due = Math.max(0, order.total - order.amountPaid);
  const p = settings.payments;
  const payMethods = [
    ...(p.orangeMoney.enabled ? [{ method: "ORANGE_MONEY" as const, label: "Orange Money", number: p.orangeMoney.number, instructions: p.orangeMoney.instructions }] : []),
    ...(p.mtnMomo.enabled ? [{ method: "MTN_MOMO" as const, label: "MTN MoMo", number: p.mtnMomo.number, instructions: p.mtnMomo.instructions, automatic: momoConfigured() }] : []),
    ...(p.card.enabled && flutterwaveConfigured() ? [{ method: "CARD" as const, label: "Card" }] : []),
  ];
  const liveLocation = delivery?.d.lat && delivery.d.lng && order.status === "OUT_FOR_DELIVERY" ? { lat: delivery.d.lat, lng: delivery.d.lng } : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {!cancelled && order.status !== "COMPLETED" && <AutoRefresh seconds={30} />}
      {sp.placed && (
        <div className="mb-6 flex animate-slide-up items-start gap-4 rounded-2xl bg-primary p-5 text-primary-fg shadow-lift">
          <PartyPopper className="h-8 w-8 shrink-0" aria-hidden />
          <div>
            <h2 className="text-lg font-bold">Thank you, {order.contactName.split(" ")[0]}! Your order is in.</h2>
            <p className="mt-1 text-sm opacity-90">We&apos;ve sent a confirmation to {formatPhone(order.contactPhone)}. Save this page to follow your order.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Order</p>
          <h1 className="text-2xl font-bold tracking-tight">{order.number}</h1>
          <p className="text-sm text-muted">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Badge tone={ORDER_STATUS_META[order.status].tone} dot>
            {order.status === "COMPLETED" ? (order.fulfillmentType === "DELIVERY" ? "Delivered" : "Picked up") : ORDER_STATUS_META[order.status].label}
          </Badge>
          <Badge tone={PAYMENT_STATUS_META[order.paymentStatus].tone}>{PAYMENT_STATUS_META[order.paymentStatus].label}</Badge>
        </div>
      </div>

      {/* Progress */}
      <Card className="mt-6 p-5 sm:p-6">
        {cancelled ? (
          <div className="flex items-start gap-3 text-danger-fg">
            <XCircle className="h-6 w-6 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">This order was cancelled</p>
              {order.cancelReason && <p className="text-sm">{order.cancelReason}</p>}
            </div>
          </div>
        ) : (
          <ol className="relative grid gap-0 sm:grid-cols-5">
            {steps.map((s, i) => {
              const done = i <= idx;
              const current = i === idx;
              return (
                <li key={s.status} className="relative flex gap-3 pb-6 last:pb-0 sm:flex-col sm:items-center sm:pb-0 sm:text-center">
                  {i < steps.length - 1 && (
                    <span className={cn("absolute left-[11px] top-7 h-[calc(100%-20px)] w-0.5 sm:left-[calc(50%+14px)] sm:top-[11px] sm:h-0.5 sm:w-[calc(100%-28px)]", i < idx ? "bg-primary" : "bg-border")} aria-hidden />
                  )}
                  <span className={cn("relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full", done ? "bg-primary text-primary-fg" : "bg-surface-2 text-subtle ring-1 ring-border")}>
                    {done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
                  </span>
                  <span className={cn("text-sm sm:mt-2", current ? "font-bold text-fg" : done ? "font-medium text-fg" : "text-muted")}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* Delivery / pickup */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          {order.fulfillmentType === "DELIVERY" ? (
            <>
              <h2 className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4 text-primary" aria-hidden /> Delivery</h2>
              <p className="mt-2 text-sm">{order.deliveryAddress?.line1}</p>
              <p className="text-sm text-muted">{[order.deliveryAddress?.area, zone?.name].filter(Boolean).join(" · ")}</p>
              {order.deliveryAddress?.landmark && <p className="text-sm text-muted">{landmarkText(order.deliveryAddress.landmark)}</p>}
              {(order.scheduledDate || order.timeSlot) && (
                <p className="mt-2 flex items-center gap-1.5 text-sm"><Clock className="h-4 w-4 text-muted" aria-hidden /> {[order.scheduledDate, order.timeSlot].filter(Boolean).join(", ")}</p>
              )}
              {delivery?.driverName && order.status !== "COMPLETED" && (
                <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
                  <p className="font-semibold">Your driver: {delivery.driverName}</p>
                  {delivery.driverPhone && (
                    <a href={`tel:${delivery.driverPhone}`} className="link mt-1 inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden /> {formatPhone(delivery.driverPhone)}</a>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-primary" aria-hidden /> Pickup</h2>
              <p className="mt-2 text-sm font-medium">{pickup?.name}</p>
              <p className="text-sm text-muted">{pickup?.address}</p>
              {pickup?.hours && <p className="text-sm text-muted">{pickup.hours}</p>}
              {pickup?.instructions && <p className="mt-2 text-sm">{pickup.instructions}</p>}
              {pickup?.lat && pickup.lng && (
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${pickup.lat},${pickup.lng}`} target="_blank" rel="noopener noreferrer" className="link mt-2 inline-flex items-center gap-1 text-sm">
                  <Navigation className="h-3.5 w-3.5" aria-hidden /> Directions
                </a>
              )}
            </>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Receipt className="h-4 w-4 text-primary" aria-hidden /> Payment</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="tabular font-semibold">{formatMoney(order.total, cur)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="tabular">{formatMoney(order.amountPaid, cur)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Balance</dt><dd className="tabular font-semibold">{formatMoney(due, cur)}</dd></div>
            {order.paymentMethod && <div className="flex justify-between"><dt className="text-muted">Method</dt><dd>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd></div>}
          </dl>
          {pendingPayments.length > 0 && <Alert tone="warning" className="mt-3">We received your payment details ({pendingPayments.map((x) => x.providerRef).filter(Boolean).join(", ")}) and are confirming it.</Alert>}
        </Card>
      </div>

      {liveLocation && (
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" aria-hidden /> Driver location</h2>
            {delivery?.d.locationUpdatedAt && <span className="text-xs text-muted">Updated {formatDateTime(delivery.d.locationUpdatedAt)}</span>}
          </div>
          <iframe
            title="Driver location map"
            className="h-64 w-full border-0"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${liveLocation.lng - 0.01},${liveLocation.lat - 0.008},${liveLocation.lng + 0.01},${liveLocation.lat + 0.008}&layer=mapnik&marker=${liveLocation.lat},${liveLocation.lng}`}
          />
        </Card>
      )}

      {due > 0 && !cancelled && pendingPayments.length === 0 && payMethods.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="font-semibold">Pay now with mobile money</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Optional — you can also pay cash on {order.fulfillmentType === "DELIVERY" ? "delivery" : "pickup"}.</p>
          <PayForm token={order.trackingToken} due={formatMoney(due, cur)} methods={payMethods} />
        </Card>
      )}

      {/* Items */}
      <Card className="mt-4">
        <h2 className="border-b border-border px-5 py-3.5 font-semibold">Items</h2>
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <span className="font-medium">{it.name}</span>
                <span className="block text-muted">
                  {formatQuantity(it.quantity, it.unit)} × {formatMoney(it.unitPrice, cur)}
                  {it.options.length > 0 && ` · ${it.options.map((o) => o.choice).join(", ")}`}
                </span>
              </span>
              <span className="tabular font-semibold">{formatMoney(it.lineTotal, cur)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-border px-5 py-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular">{formatMoney(order.subtotal, cur)}</dd></div>
          {order.discountTotal > 0 && <div className="flex justify-between text-success-fg"><dt>Discount{order.promoCode ? ` (${order.promoCode})` : ""}</dt><dd className="tabular">−{formatMoney(order.discountTotal, cur)}</dd></div>}
          {order.fulfillmentType === "DELIVERY" && <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular">{order.deliveryFee ? formatMoney(order.deliveryFee, cur) : "Free"}</dd></div>}
          {order.taxTotal > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tabular">{formatMoney(order.taxTotal, cur)}</dd></div>}
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd className="tabular">{formatMoney(order.total, cur)}</dd></div>
        </dl>
      </Card>

      {/* History */}
      {events.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="font-semibold">Updates</h2>
          <ol className="mt-3 space-y-3 border-l-2 border-border pl-4">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="text-sm">
                <p className="font-medium">{e.message}</p>
                <p className="text-xs text-muted">{formatDateTime(e.createdAt)}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="mt-6 flex flex-col items-center gap-3 text-sm sm:flex-row sm:justify-center">
        {settings.business.whatsapp && (
          <a href={whatsappLink(settings.business.whatsapp, `Hello, I have a question about order ${order.number}`)} className="inline-flex items-center gap-2 font-semibold text-[#128C4B]">
            <SocialIcon name="whatsapp" className="h-4 w-4" /> Questions? Chat with us
          </a>
        )}
        <Link href="/shop" className="link">Continue shopping</Link>
      </div>
    </div>
  );
}
