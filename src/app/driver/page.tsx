import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { LogOut, MapPin, Navigation, Phone, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { deliveries, deliveryZones, orderItems, orders } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { centsToInput, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { DELIVERY_STATUS_META, formatQuantity } from "@/lib/constants";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { LogoMark } from "@/components/logo";
import { ClaimButton, DeliverySteps, LocationSharer } from "@/components/driver";
import { SocialIcon } from "@/components/shop/visuals";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata = { title: "Driver", robots: { index: false } };

export default async function DriverPage() {
  const user = await requireStaff("deliveries:drive", "/driver");
  const cur = (await getSettings()).commerce.currency;
  const mine = await db
    .select({ d: deliveries, o: orders, zone: deliveryZones.name })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .leftJoin(deliveryZones, eq(deliveryZones.id, orders.deliveryZoneId))
    .where(and(eq(deliveries.driverId, user.id), inArray(deliveries.status, ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"]), sql`${orders.status} not in ('CANCELLED','COMPLETED')`))
    .orderBy(asc(orders.scheduledDate), asc(orders.createdAt));
  const open = await db
    .select({ o: orders, zone: deliveryZones.name })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .leftJoin(deliveryZones, eq(deliveryZones.id, orders.deliveryZoneId))
    .where(and(eq(deliveries.status, "UNASSIGNED"), isNull(deliveries.driverId), inArray(orders.status, ["CONFIRMED", "PROCESSING", "READY"])))
    .orderBy(asc(orders.createdAt))
    .limit(10);
  const itemsByOrder = new Map<string, { name: string; quantity: number; unit: string }[]>();
  if (mine.length) {
    const items = await db.select({ orderId: orderItems.orderId, name: orderItems.name, quantity: orderItems.quantity, unit: orderItems.unit }).from(orderItems).where(inArray(orderItems.orderId, mine.map((m) => m.o.id)));
    for (const it of items) itemsByOrder.set(it.orderId, [...(itemsByOrder.get(it.orderId) ?? []), it]);
  }
  const [today] = await db.select({ n: sql<number>`count(*)::int`, cash: sql<number>`coalesce(sum(${deliveries.codCollected}),0)::int` }).from(deliveries).where(and(eq(deliveries.driverId, user.id), eq(deliveries.status, "DELIVERED"), sql`${deliveries.deliveredAt}::date = current_date`));
  const moving = mine.some((m) => m.d.status === "IN_TRANSIT" || m.d.status === "PICKED_UP");

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-bg pb-10">
      <AutoRefresh seconds={45} />
      <header className="sticky top-0 z-10 flex items-center justify-between bg-brand-900 px-4 py-3 text-white">
        <span className="flex items-center gap-2 font-bold"><LogoMark className="h-8 w-8" /> Deliveries</span>
        <span className="flex items-center gap-3 text-sm">
          {user.name.split(" ")[0]}
          <form action={logoutAction}><button aria-label="Sign out"><LogOut className="h-4 w-4" /></button></form>
        </span>
      </header>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Card className="p-3"><p className="text-xs text-muted">To deliver</p><p className="text-xl font-bold">{mine.length}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted">Done today</p><p className="text-xl font-bold">{today?.n ?? 0}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted">Cash today</p><p className="tabular text-xl font-bold">{formatMoney(today?.cash ?? 0, cur, { showZeroDecimals: false })}</p></Card>
        </div>
        <LocationSharer active={moving} />
        {mine.length === 0 && <Card><EmptyState icon={<Truck className="h-6 w-6" />} title="No deliveries assigned" description="New deliveries will appear here." /></Card>}
        {mine.map(({ d, o, zone }) => {
          const a = o.deliveryAddress;
          const due = Math.max(0, o.total - o.amountPaid);
          const maps = a?.lat && a.lng ? `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}` : `https://www.google.com/maps/search/${encodeURIComponent([a?.line1, a?.area, "Monrovia, Liberia"].filter(Boolean).join(", "))}`;
          return (
            <Card key={d.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div><p className="font-bold">{o.number}</p><p className="text-xs text-muted">{zone}{o.scheduledDate && ` · ${formatDate(o.scheduledDate, { day: "numeric", month: "short" })}`}{o.timeSlot && ` · ${o.timeSlot}`}</p></div>
                <StatusBadge status={d.status} meta={DELIVERY_STATUS_META} />
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="font-semibold">{o.contactName}</p>
                  <p className="flex gap-1.5 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{[a?.line1, a?.area].filter(Boolean).join(", ")}</p>
                  {a?.landmark && <p className="pl-5 text-sm text-muted">Near {a.landmark}</p>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm font-semibold">
                  <a href={`tel:${o.contactPhone}`} className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2.5"><Phone className="h-4 w-4" aria-hidden /> Call</a>
                  <a href={whatsappLink(o.contactPhone)} className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366]/15 py-2.5 text-[#128C4B]"><SocialIcon name="whatsapp" className="h-4 w-4" /> Chat</a>
                  <a href={maps} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-info-soft py-2.5 text-info-fg"><Navigation className="h-4 w-4" aria-hidden /> Map</a>
                </div>
                <ul className="rounded-xl bg-surface-2 p-3 text-sm">
                  {(itemsByOrder.get(o.id) ?? []).map((it, i) => <li key={i}>{formatQuantity(it.quantity, it.unit)} · {it.name}</li>)}
                </ul>
                {o.customerNote && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning-fg">{o.customerNote}</p>}
                <p className="text-sm">{due > 0 ? <>Collect <strong className="tabular text-lg">{formatMoney(due, cur)}</strong> from customer</> : <span className="font-semibold text-success-fg">Already paid — nothing to collect</span>}</p>
                <DeliverySteps orderId={o.id} status={d.status} due={due > 0 ? centsToInput(due) : "0"} />
                <p className="text-center text-xs text-muted">{formatPhone(o.contactPhone)}</p>
              </div>
            </Card>
          );
        })}
        {open.length > 0 && (
          <Card>
            <p className="border-b border-border px-4 py-3 font-semibold">Waiting for a driver</p>
            <ul className="divide-y divide-border">
              {open.map(({ o, zone }) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span><span className="font-semibold">{o.number}</span><span className="block text-muted">{zone} · {o.deliveryAddress?.area ?? ""}</span></span>
                  <ClaimButton orderId={o.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
