import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ExternalLink, FileText, MapPin, Navigation, Phone, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { customers, deliveries, deliveryZones, invoices, orderEvents, orderItems, orders, payments, pickupLocations, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { centsToInput, formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, landmarkText } from "@/lib/format";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { allowedTransitions } from "@/lib/order-status";
import { appUrl } from "@/lib/request";
import { DELIVERY_STATUS_META, formatQuantity, ORDER_CHANNEL_LABELS, ORDER_STATUS_META, PAYMENT_METHOD_LABELS, PAYMENT_RECORD_STATUS_META, PAYMENT_STATUS_META, unitLabel } from "@/lib/constants";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader, DescriptionList, PageHeader, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { DriverSelect, MessageForm, NoteForm, PaymentForm, ScheduleForm, SettleButtons, StatusActions, WeightEditor } from "@/components/admin/order-forms";
import { SocialIcon } from "@/components/shop/visuals";
import { createInvoiceAction } from "../actions";

export default async function OrderDetailPage(props: PageProps<"/admin/orders/[id]">) {
  const user = await requireStaff("orders:view");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) notFound();
  const settings = await getSettings();
  const cur = settings.commerce.currency;

  const [items, events, pays, [delivery], [customer], [zone], [pickup], drivers, [invoice]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db.select({ e: orderEvents, actor: users.name }).from(orderEvents).leftJoin(users, eq(users.id, orderEvents.actorId)).where(eq(orderEvents.orderId, id)).orderBy(desc(orderEvents.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(asc(payments.createdAt)),
    db.select({ d: deliveries, driver: users.name, driverPhone: users.phone }).from(deliveries).leftJoin(users, eq(users.id, deliveries.driverId)).where(eq(deliveries.orderId, id)),
    db.select().from(customers).where(eq(customers.id, order.customerId)),
    order.deliveryZoneId ? db.select().from(deliveryZones).where(eq(deliveryZones.id, order.deliveryZoneId)) : Promise.resolve([]),
    order.pickupLocationId ? db.select().from(pickupLocations).where(eq(pickupLocations.id, order.pickupLocationId)) : Promise.resolve([]),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "DRIVER"), eq(users.active, true))),
    db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(eq(invoices.orderId, id)).limit(1),
  ]);

  const due = Math.max(0, order.total - order.amountPaid);
  const transitions = can(user.role, "orders:manage") ? allowedTransitions(order.status, order.fulfillmentType) : [];
  const hasWeighed = items.some((i) => i.variableWeight);
  const addr = order.deliveryAddress;
  const mapsLink = addr?.lat && addr.lng ? `https://www.google.com/maps/dir/?api=1&destination=${addr.lat},${addr.lng}` : addr ? `https://www.google.com/maps/search/${encodeURIComponent([addr.line1, addr.area, addr.city, "Liberia"].filter(Boolean).join(", "))}` : null;
  const trackUrl = appUrl(`/track/${order.trackingToken}`);
  const first = order.contactName.split(" ")[0];
  const quickReplies = [
    { label: "Confirm", body: `Hi ${first}, this is ${settings.business.name}. Your order ${order.number} is confirmed. Track it here: ${trackUrl}` },
    { label: "Weight / total", body: `Hi ${first}, your order ${order.number} has been weighed. The final total is ${formatMoney(order.total, cur)}. Thank you!` },
    { label: "On the way", body: `Hi ${first}, your order ${order.number} is on the way. Please have ${formatMoney(due, cur)} ready. Track: ${trackUrl}` },
    { label: "Ready", body: `Hi ${first}, your order ${order.number} is ready for pickup at ${pickup?.name ?? settings.business.address}.` },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {order.number}
            <StatusBadge status={order.status} meta={ORDER_STATUS_META} />
            <Badge tone={PAYMENT_STATUS_META[order.paymentStatus].tone}>{PAYMENT_STATUS_META[order.paymentStatus].label}</Badge>
          </span>
        }
        description={`${ORDER_CHANNEL_LABELS[order.channel]} order · ${formatDateTime(order.createdAt)}${order.utmCampaign ? ` · campaign ${order.utmCampaign}` : ""}`}
        actions={
          <>
            <ButtonLink href={`/print/order/${id}`} variant="outline" size="sm" target="_blank"><Printer className="h-4 w-4" aria-hidden /> Receipt</ButtonLink>
            {invoice ? (
              <ButtonLink href={`/admin/invoices/${invoice.id}`} variant="outline" size="sm"><FileText className="h-4 w-4" aria-hidden /> {invoice.number}</ButtonLink>
            ) : (
              can(user.role, "invoices:manage") && <ActionButton action={createInvoiceAction} fields={{ orderId: id }} variant="outline"><FileText className="h-4 w-4" aria-hidden /> Create invoice</ActionButton>
            )}
            <ButtonLink href={`/track/${order.trackingToken}`} variant="ghost" size="sm" target="_blank"><ExternalLink className="h-4 w-4" aria-hidden /> Customer view</ButtonLink>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {transitions.length > 0 && (
            <Card>
              <CardHeader title="Next step" description={hasWeighed && order.status !== "COMPLETED" ? "Set actual weights on weighed items before completing the order." : undefined} />
              <CardBody><StatusActions orderId={id} transitions={transitions} fulfillment={order.fulfillmentType} /></CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={`Items (${items.length})`} />
            <ul className="divide-y divide-border">
              {items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div>
                    {it.productId ? <Link href={`/admin/products/${it.productId}`} className="font-semibold hover:underline">{it.name}</Link> : <span className="font-semibold">{it.name}</span>}
                    {it.options.length > 0 && <p className="text-sm text-muted">{it.options.map((o) => `${o.group}: ${o.choice}`).join(" · ")}</p>}
                    <p className="text-sm text-muted">{formatQuantity(it.quantity, it.unit)} × {formatMoney(it.unitPrice, cur)}/{unitLabel(it.unit)}{it.sku && ` · ${it.sku}`}</p>
                    {it.variableWeight && can(user.role, "orders:manage") && order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
                      <WeightEditor orderId={id} itemId={it.id} quantity={it.quantity} unit={unitLabel(it.unit, 2)} />
                    )}
                  </div>
                  <p className="tabular font-semibold">{formatMoney(it.lineTotal, cur)}</p>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-5 py-4">
              <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular">{formatMoney(order.subtotal, cur)}</dd></div>
                {order.discountTotal > 0 && <div className="flex justify-between text-success-fg"><dt>Discount {order.promoCode && `(${order.promoCode})`}</dt><dd className="tabular">−{formatMoney(order.discountTotal, cur)}</dd></div>}
                {order.fulfillmentType === "DELIVERY" && <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular">{formatMoney(order.deliveryFee, cur)}</dd></div>}
                {order.taxTotal > 0 && <div className="flex justify-between"><dt className="text-muted">{settings.commerce.taxLabel}</dt><dd className="tabular">{formatMoney(order.taxTotal, cur)}</dd></div>}
                <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular">{formatMoney(order.total, cur)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="tabular">{formatMoney(order.amountPaid, cur)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular">{formatMoney(due, cur)}</dd></div>
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            {pays.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No payments yet{order.paymentMethod ? ` — customer chose ${PAYMENT_METHOD_LABELS[order.paymentMethod]}` : ""}.</p>
            ) : (
              <ul className="divide-y divide-border">
                {pays.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium">{p.kind === "REFUND" ? "Refund · " : ""}{PAYMENT_METHOD_LABELS[p.method]} <span className="text-muted">· {p.reference}</span></p>
                      <p className="text-xs text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}{p.providerRef && ` · ref ${p.providerRef}`}{p.payerPhone && ` · from ${formatPhone(p.payerPhone)}`}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={p.status} meta={PAYMENT_RECORD_STATUS_META} />
                      <span className="tabular font-semibold">{p.kind === "REFUND" ? "−" : ""}{formatMoney(p.amount, cur)}</span>
                      {p.status === "PENDING" && can(user.role, "payments:manage") && <SettleButtons paymentId={p.id} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <CardBody className="space-y-5">
              <NoteForm orderId={id} />
              <ol className="space-y-4 border-l-2 border-border pl-4">
                {events.map(({ e, actor }) => (
                  <li key={e.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-surface" aria-hidden />
                    <p className="font-medium">{e.message}</p>
                    <p className="text-xs text-muted">{formatDateTime(e.createdAt)} · {actor ?? (e.type === "STATUS" && !e.actorId ? "Customer / system" : "System")}{e.isPublic ? " · visible to customer" : ""}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer" action={customer && can(user.role, "customers:view") ? <Link href={`/admin/customers/${customer.id}`} className="link text-sm">Profile</Link> : undefined} />
            <CardBody className="space-y-3 text-sm">
              <p className="font-semibold">{order.contactName}{customer && customer.ordersCount > 1 && <Badge tone="brand" className="ml-2">{customer.ordersCount} orders</Badge>}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${order.contactPhone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 font-medium hover:bg-surface-3"><Phone className="h-3.5 w-3.5" aria-hidden /> {formatPhone(order.contactPhone)}</a>
                <a href={whatsappLink(order.contactPhone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366]/15 px-2.5 py-1.5 font-medium text-[#128C4B]"><SocialIcon name="whatsapp" className="h-3.5 w-3.5" /> WhatsApp</a>
              </div>
              {order.contactEmail && <p className="text-muted">{order.contactEmail}</p>}
              {order.customerNote && <Alert tone="warning" title="Customer note">{order.customerNote}</Alert>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={order.fulfillmentType === "DELIVERY" ? "Delivery" : "Pickup"} action={delivery ? <StatusBadge status={delivery.d.status} meta={DELIVERY_STATUS_META} /> : undefined} />
            <CardBody className="space-y-4 text-sm">
              {order.fulfillmentType === "DELIVERY" && addr ? (
                <>
                  <div className="flex gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <div>
                      <p className="font-medium">{addr.line1}</p>
                      <p className="text-muted">{[addr.area, addr.city].filter(Boolean).join(", ")}</p>
                      {addr.landmark && <p className="text-muted">{landmarkText(addr.landmark)}</p>}
                      <p className="text-muted">Zone: {zone?.name ?? "—"}</p>
                    </div>
                  </div>
                  {mapsLink && <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><Navigation className="h-3.5 w-3.5" aria-hidden /> Open in Maps</a>}
                  {can(user.role, "deliveries:manage") && order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
                    <div>
                      <p className="mb-1.5 font-medium">Driver</p>
                      <DriverSelect orderId={id} drivers={drivers} current={delivery?.d.driverId ?? null} />
                    </div>
                  )}
                  {delivery?.driver && <p className="text-muted">Assigned: {delivery.driver}{delivery.d.deliveredAt && ` · delivered ${formatDateTime(delivery.d.deliveredAt)}`}{delivery.d.recipientName && ` to ${delivery.d.recipientName}`}</p>}
                  {delivery?.d.proofNote && <p className="text-muted">Note: {delivery.d.proofNote}</p>}
                </>
              ) : (
                <DescriptionList items={[{ label: "Location", value: pickup?.name }, { label: "Address", value: pickup?.address }]} />
              )}
              {can(user.role, "orders:manage") && (
                <ScheduleForm orderId={id} internalNote={order.internalNote ?? ""} scheduledDate={order.scheduledDate ?? ""} timeSlot={order.timeSlot ?? ""} slots={settings.commerce.timeSlots} />
              )}
              {!can(user.role, "orders:manage") && order.scheduledDate && <p>Scheduled: {formatDate(order.scheduledDate)} {order.timeSlot}</p>}
            </CardBody>
          </Card>

          {can(user.role, "payments:manage") && order.status !== "CANCELLED" && (
            <Card>
              <CardHeader title={due > 0 ? `Take payment · ${formatMoney(due, cur)} due` : "Payments & refunds"} />
              <CardBody><PaymentForm orderId={id} due={due > 0 ? centsToInput(due) : ""} defaultMethod={order.paymentMethod} allowRefund={order.amountPaid > 0} /></CardBody>
            </Card>
          )}

          {can(user.role, "messages:send") && (
            <Card>
              <CardHeader title="Message customer" />
              <CardBody><MessageForm customerId={order.customerId} orderId={id} phone={order.contactPhone} email={order.contactEmail} templates={quickReplies} /></CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
