import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { deliveries, deliveryZones, orders, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { deliveryPerformance, rangeFromPreset } from "@/lib/services/analytics";
import { DELIVERY_STATUS_META, ORDER_STATUS_META } from "@/lib/constants";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { DriverSelect } from "@/components/admin/order-forms";

export const metadata = { title: "Deliveries" };

const COLUMNS = [
  { key: "UNASSIGNED", title: "Needs a driver" },
  { key: "ASSIGNED", title: "Assigned" },
  { key: "IN_TRANSIT", title: "On the road" },
] as const;

export default async function DeliveriesPage() {
  const user = await requireStaff("deliveries:view");
  const cur = (await getSettings()).commerce.currency;
  const [rows, drivers, perf] = await Promise.all([
    db
      .select({ d: deliveries, o: orders, zone: deliveryZones.name, driver: users.name })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .leftJoin(deliveryZones, eq(deliveryZones.id, orders.deliveryZoneId))
      .leftJoin(users, eq(users.id, deliveries.driverId))
      .where(and(sql`${orders.status} not in ('COMPLETED','CANCELLED')`, sql`${deliveries.status} not in ('DELIVERED')`))
      .orderBy(asc(orders.scheduledDate), asc(orders.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "DRIVER"), eq(users.active, true))),
    deliveryPerformance(rangeFromPreset("30d")),
  ]);
  const manage = can(user.role, "deliveries:manage");
  const col = (k: string) => rows.filter((r) => (k === "IN_TRANSIT" ? r.d.status === "IN_TRANSIT" || r.d.status === "PICKED_UP" : k === "UNASSIGNED" ? r.d.status === "UNASSIGNED" || r.d.status === "FAILED" : r.d.status === k));

  return (
    <>
      <PageHeader title="Deliveries" description="Dispatch board — assign drivers, follow progress and cash on delivery." actions={<ButtonLink href="/driver" variant="outline" size="sm">Open driver app</ButtonLink>} />
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = col(c.key);
          return (
            <div key={c.key} className="rounded-2xl bg-surface-2/60 p-3">
              <p className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">{c.title}<span className="rounded-full bg-surface px-2 text-xs">{list.length}</span></p>
              <div className="space-y-3">
                {list.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted">Nothing here</p>}
                {list.map(({ d, o, zone, driver }) => (
                  <Card key={d.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline">{o.number}</Link>
                      <StatusBadge status={o.status} meta={ORDER_STATUS_META} />
                    </div>
                    <p className="mt-1 text-sm">{o.contactName}</p>
                    <p className="flex gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{zone} · {o.deliveryAddress?.area ?? o.deliveryAddress?.line1}</p>
                    <p className="mt-1 text-xs text-muted">{o.scheduledDate ? formatDate(o.scheduledDate, { weekday: "short", day: "numeric", month: "short" }) : `ordered ${timeAgo(o.createdAt)}`}{o.timeSlot && ` · ${o.timeSlot}`}</p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="tabular font-semibold">{o.total > o.amountPaid ? `Collect ${formatMoney(o.total - o.amountPaid, cur)}` : <Badge tone="success">Paid</Badge>}</span>
                      {d.status === "FAILED" && <Badge tone="danger">Failed: {d.failedReason}</Badge>}
                    </div>
                    {manage ? <div className="mt-3"><DriverSelect orderId={o.id} drivers={drivers} current={d.driverId} /></div> : driver && <p className="mt-2 text-xs">Driver: {driver}</p>}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Card className="mt-6">
        <CardHeader title="Driver performance" description="Last 30 days" />
        {perf.length === 0 ? <EmptyState title="No deliveries yet" /> : (
          <Table>
            <thead><tr><Th>Driver</Th><Th align="right">Delivered</Th><Th align="right">Failed</Th><Th align="right">Avg. time from order</Th><Th align="right">Cash collected</Th></tr></thead>
            <tbody>
              {perf.map((p) => (
                <tr key={p.driver}><Td className="font-medium">{p.driver}</Td><Td align="right">{p.delivered}</Td><Td align="right">{p.failed}</Td><Td align="right">{p.avgHours ? `${p.avgHours.toFixed(1)} h` : "—"}</Td><Td align="right">{formatMoney(p.cod, cur)}</Td></tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">Status legend: {Object.values(DELIVERY_STATUS_META).map((m) => m.label).join(" → ")}</p>
    </>
  );
}
