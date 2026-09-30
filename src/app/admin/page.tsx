import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { AlertTriangle, CalendarDays, Inbox, PackageCheck, Truck, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { bookings, deliveries, messages, orders, payments } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { cashSummary, dailySeries, newCustomers, pctChange, previousRange, rangeFromPreset, salesByCategory, salesSummary, topProducts, breakdown } from "@/lib/services/analytics";
import { lowStockProducts } from "@/lib/services/inventory";
import { formatMoney } from "@/lib/money";
import { timeAgo } from "@/lib/format";
import { formatQuantity, ORDER_CHANNEL_LABELS, ORDER_STATUS_META, PAYMENT_STATUS_META } from "@/lib/constants";
import { Badge, Card, CardBody, CardHeader, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { BarList, TimeSeriesChart } from "@/components/charts";
import { RangeTabs, sp, StatTile } from "@/components/admin/bits";

export default async function DashboardPage(props: PageProps<"/admin">) {
  const user = await requireStaff("dashboard:view");
  const params = await props.searchParams;
  const range = rangeFromPreset(sp(params.range) ?? "30d");
  const prev = previousRange(range);
  const settings = await getSettings();
  const cur = settings.commerce.currency;
  const showMoney = can(user.role, "finance:view") || can(user.role, "orders:view");

  const [sales, prevSales, cash, prevCash, custs, prevCusts, series, cats, top, channels, low, recent, queue] = await Promise.all([
    salesSummary(range),
    salesSummary(prev),
    cashSummary(range),
    cashSummary(prev),
    newCustomers(range),
    newCustomers(prev),
    dailySeries(range),
    salesByCategory(range),
    topProducts(range, 6),
    breakdown(range, "channel"),
    lowStockProducts(db, 8),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
    db
      .select({
        pending: sql<number>`(select count(*)::int from ${orders} where ${orders.status} = 'PENDING')`,
        ready: sql<number>`(select count(*)::int from ${orders} where ${orders.status} in ('CONFIRMED','PROCESSING'))`,
        unassigned: sql<number>`(select count(*)::int from ${deliveries} d join ${orders} o on o.id = d.order_id where d.status = 'UNASSIGNED' and o.status not in ('CANCELLED','COMPLETED'))`,
        payments: sql<number>`(select count(*)::int from ${payments} where ${payments.status} = 'PENDING')`,
        bookings: sql<number>`(select count(*)::int from ${bookings} where ${bookings.status} = 'REQUESTED')`,
        unread: sql<number>`(select count(*)::int from ${messages} where ${messages.direction} = 'INBOUND' and ${messages.readAt} is null)`,
      })
      .from(sql`(select 1) one`),
  ]);
  const q = queue[0]!;

  const tasks = [
    { n: q.pending, label: "orders to confirm", href: "/admin/orders?status=PENDING", icon: PackageCheck, perm: "orders:manage" as const },
    { n: q.ready, label: "orders to prepare", href: "/admin/orders?status=CONFIRMED", icon: PackageCheck, perm: "orders:view" as const },
    { n: q.unassigned, label: "deliveries need a driver", href: "/admin/deliveries", icon: Truck, perm: "deliveries:manage" as const },
    { n: q.payments, label: "payments to verify", href: "/admin/payments?status=PENDING", icon: Wallet, perm: "payments:manage" as const },
    { n: q.bookings, label: "booking requests", href: "/admin/bookings", icon: CalendarDays, perm: "bookings:manage" as const },
    { n: q.unread, label: "unread messages", href: "/admin/messages", icon: Inbox, perm: "messages:view" as const },
    { n: low.length, label: "products low on stock", href: "/admin/inventory?filter=low", icon: AlertTriangle, perm: "inventory:view" as const },
  ].filter((t) => t.n > 0 && can(user.role, t.perm));

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Monrovia" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}, ${user.name.split(" ")[0]}`} description={`Here's how ${settings.business.name} is doing — ${range.label.toLowerCase()}.`} actions={<RangeTabs active={range.preset} base="/admin" />} />

      {tasks.length > 0 && (
        <div className="scrollbar-none -mx-4 mb-6 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {tasks.map((t) => (
            <Link key={t.label} href={t.href} className="flex shrink-0 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm shadow-card transition hover:border-primary/40">
              <t.icon className="h-4 w-4 text-accent" aria-hidden />
              <span className="tabular font-bold">{t.n}</span> <span className="text-muted">{t.label}</span>
            </Link>
          ))}
        </div>
      )}

      {showMoney && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Sales" value={formatMoney(sales.revenue, cur)} delta={pctChange(sales.revenue, prevSales.revenue)} hint="vs previous" href="/admin/orders" />
          <StatTile label="Orders" value={String(sales.orders)} delta={pctChange(sales.orders, prevSales.orders)} hint={`${sales.cancelled} cancelled`} href="/admin/orders" />
          <StatTile label="Avg. order" value={formatMoney(sales.aov, cur)} delta={pctChange(sales.aov, prevSales.aov)} />
          <StatTile label="Cash collected" value={formatMoney(cash.cashIn - cash.refunds, cur)} delta={pctChange(cash.cashIn, prevCash.cashIn)} href="/admin/payments" />
          <StatTile label="Expenses" value={formatMoney(cash.expenses, cur)} delta={pctChange(cash.expenses, prevCash.expenses)} invert href="/admin/expenses" />
          <StatTile label="New customers" value={String(custs)} delta={pctChange(custs, prevCusts)} href="/admin/customers" />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales vs cash collected" description={`${series.bucket === "month" ? "Monthly" : "Daily"} order value and payments received`} />
          <CardBody>
            <TimeSeriesChart
              labels={series.points.map((p) => p.date)}
              bucket={series.bucket}
              currency={cur}
              series={[
                { key: "revenue", label: "Sales", values: series.points.map((p) => p.revenue), kind: "area" },
                { key: "cash", label: "Cash collected", values: series.points.map((p) => p.cashIn), kind: "line" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sales by category" />
          <CardBody>
            <BarList items={cats.map((c) => ({ label: c.name, value: c.revenue }))} currency={cur} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Latest orders" action={<Link href="/admin/orders" className="link text-sm">View all</Link>} />
          <Table>
            <thead>
              <tr><Th>Order</Th><Th>Customer</Th><Th>Status</Th><Th>Payment</Th><Th align="right">Total</Th></tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="hover:bg-surface-2/50">
                  <Td><Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline">{o.number}</Link><p className="text-xs text-muted">{timeAgo(o.createdAt)} · {ORDER_CHANNEL_LABELS[o.channel]}</p></Td>
                  <Td>{o.contactName}<p className="text-xs text-muted">{o.fulfillmentType === "DELIVERY" ? "Delivery" : "Pickup"}</p></Td>
                  <Td><StatusBadge status={o.status} meta={ORDER_STATUS_META} /></Td>
                  <Td><Badge tone={PAYMENT_STATUS_META[o.paymentStatus].tone}>{PAYMENT_STATUS_META[o.paymentStatus].label}</Badge></Td>
                  <Td align="right" className="font-semibold">{formatMoney(o.total, cur)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Best sellers" />
            <CardBody><BarList items={top.map((t) => ({ label: t.name, value: t.revenue, hint: `${formatQuantity(Math.round(t.qty * 10) / 10, t.unit)} · ${t.orders} orders` }))} currency={cur} colorIndex={0} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Orders by channel" />
            <CardBody><BarList items={channels.map((c) => ({ label: ORDER_CHANNEL_LABELS[c.key as keyof typeof ORDER_CHANNEL_LABELS] ?? c.key, value: c.orders }))} format="number" /></CardBody>
          </Card>
          {low.length > 0 && can(user.role, "inventory:view") && (
            <Card>
              <CardHeader title="Low stock" action={<Link href="/admin/inventory?filter=low" className="link text-sm">Restock</Link>} />
              <ul className="divide-y divide-border">
                {low.map((p) => (
                  <li key={p.id} className="flex justify-between px-5 py-2.5 text-sm">
                    <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    <span className={p.stockQty <= 0 ? "font-semibold text-danger" : "text-warning-fg"}>{formatQuantity(p.stockQty, p.unit)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
