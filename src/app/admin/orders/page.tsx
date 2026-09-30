import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { Download, Plus, ShoppingCart } from "lucide-react";
import { db } from "@/lib/db";
import { deliveries, orders, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ORDER_CHANNEL_LABELS, ORDER_STATUS_META, ORDER_STATUSES, PAYMENT_STATUS_META, type OrderStatus } from "@/lib/constants";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Pagination, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui";
import { pageNum, sp } from "@/components/admin/bits";

export const metadata = { title: "Orders" };
const PAGE = 25;

export default async function OrdersPage(props: PageProps<"/admin/orders">) {
  const user = await requireStaff("orders:view");
  const params = await props.searchParams;
  const status = sp(params.status) as OrderStatus | "OPEN" | undefined;
  const q = sp(params.q)?.trim();
  const payment = sp(params.payment);
  const fulfil = sp(params.fulfillment);
  const from = sp(params.from);
  const to = sp(params.to);
  const page = pageNum(params.page);
  const cur = (await getSettings()).commerce.currency;

  const conds: SQL[] = [];
  if (status === "OPEN") conds.push(sql`${orders.status} not in ('COMPLETED','CANCELLED')`);
  else if (status && (ORDER_STATUSES as readonly string[]).includes(status)) conds.push(eq(orders.status, status));
  if (q) {
    const term = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(orders.number, term), ilike(orders.contactName, term), ilike(orders.contactPhone, `%${q.replace(/\D/g, "") || q}%`))!);
  }
  if (payment) conds.push(eq(orders.paymentStatus, payment as "UNPAID"));
  if (fulfil === "DELIVERY" || fulfil === "PICKUP") conds.push(eq(orders.fulfillmentType, fulfil));
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) conds.push(gte(orders.createdAt, new Date(`${from}T00:00:00Z`)));
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) conds.push(lte(orders.createdAt, new Date(`${to}T23:59:59Z`)));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ total }], counts] = await Promise.all([
    db
      .select({ o: orders, driver: users.name, dStatus: deliveries.status })
      .from(orders)
      .leftJoin(deliveries, eq(deliveries.orderId, orders.id))
      .leftJoin(users, eq(users.id, deliveries.driverId))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(orders).where(where),
    db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const openCount = counts.filter((c) => c.status !== "COMPLETED" && c.status !== "CANCELLED").reduce((a, c) => a + c.n, 0);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ q, payment, fulfillment: fulfil, from, to, status, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/admin/orders?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order from the website, WhatsApp, phone and walk-ins."
        actions={
          <>
            {can(user.role, "reports:view") && <ButtonLink href={`/api/admin/export/orders?${new URLSearchParams({ from: from ?? "", to: to ?? "" })}`} variant="outline" size="sm"><Download className="h-4 w-4" aria-hidden /> Export CSV</ButtonLink>}
            {can(user.role, "pos:use") && <ButtonLink href="/admin/pos" size="sm"><Plus className="h-4 w-4" aria-hidden /> New order</ButtonLink>}
          </>
        }
      />
      <Tabs
        active={status ?? "ALL"}
        tabs={[
          { key: "ALL", label: "All", href: qs({ status: undefined, page: undefined }) },
          { key: "OPEN", label: "Open", href: qs({ status: "OPEN" }), count: openCount },
          ...(["PENDING", "CONFIRMED", "PROCESSING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] as const).map((s) => ({ key: s, label: ORDER_STATUS_META[s].label, href: qs({ status: s }), count: count(s) })),
        ]}
      />
      <form action="/admin/orders" className="mt-4 flex flex-wrap items-end gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Order #, name or phone" className="field h-10 w-full sm:w-60" />
        <select name="payment" defaultValue={payment ?? ""} className="field h-10 w-auto">
          <option value="">Any payment</option>
          {Object.entries(PAYMENT_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="fulfillment" defaultValue={fulfil ?? ""} className="field h-10 w-auto">
          <option value="">Delivery & pickup</option>
          <option value="DELIVERY">Delivery</option>
          <option value="PICKUP">Pickup</option>
        </select>
        <input type="date" name="from" defaultValue={from} className="field h-10 w-auto" aria-label="From date" />
        <input type="date" name="to" defaultValue={to} className="field h-10 w-auto" aria-label="To date" />
        <button className="h-10 rounded-xl bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3">Filter</button>
        {(q || payment || fulfil || from || to) && <Link href={qs({ q: undefined, payment: undefined, fulfillment: undefined, from: undefined, to: undefined })} className="px-2 text-sm text-muted hover:text-fg">Clear</Link>}
      </form>

      <Card className="mt-4">
        {rows.length === 0 ? (
          <EmptyState icon={<ShoppingCart className="h-6 w-6" />} title="No orders match" description="Try a different filter." />
        ) : (
          <Table>
            <thead>
              <tr><Th>Order</Th><Th>Customer</Th><Th>Fulfilment</Th><Th>Status</Th><Th>Payment</Th><Th align="right">Total</Th></tr>
            </thead>
            <tbody>
              {rows.map(({ o, driver, dStatus }) => (
                <tr key={o.id} className="hover:bg-surface-2/50">
                  <Td>
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline">{o.number}</Link>
                    <p className="text-xs text-muted" title={formatDate(o.createdAt)}>{timeAgo(o.createdAt)} · {ORDER_CHANNEL_LABELS[o.channel]}</p>
                  </Td>
                  <Td>
                    <p className="font-medium">{o.contactName}</p>
                    <p className="text-xs text-muted">{formatPhone(o.contactPhone)}</p>
                  </Td>
                  <Td>
                    <p>{o.fulfillmentType === "DELIVERY" ? "Delivery" : "Pickup"}{o.scheduledDate && <span className="text-muted"> · {formatDate(o.scheduledDate, { day: "numeric", month: "short" })}</span>}</p>
                    {o.fulfillmentType === "DELIVERY" && <p className="text-xs text-muted">{driver ? `Driver: ${driver}` : dStatus === "UNASSIGNED" && o.status !== "CANCELLED" && o.status !== "COMPLETED" ? "No driver yet" : ""}</p>}
                  </Td>
                  <Td><StatusBadge status={o.status} meta={ORDER_STATUS_META} /></Td>
                  <Td><Badge tone={PAYMENT_STATUS_META[o.paymentStatus].tone}>{PAYMENT_STATUS_META[o.paymentStatus].label}</Badge></Td>
                  <Td align="right">
                    <span className="font-semibold">{formatMoney(o.total, cur)}</span>
                    {o.amountPaid > 0 && o.amountPaid < o.total && <p className="text-xs text-muted">due {formatMoney(o.total - o.amountPaid, cur)}</p>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} hrefFor={(p) => qs({ page: String(p) })} />
      </Card>
    </>
  );
}
