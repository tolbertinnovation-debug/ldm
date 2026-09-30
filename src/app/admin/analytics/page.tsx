import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatPercent } from "@/lib/format";
import { breakdown, campaignPerformance, customerInsights, dailySeries, newCustomers, pctChange, previousRange, rangeFromPreset, salesSummary, topProducts } from "@/lib/services/analytics";
import { CAMPAIGN_CHANNEL_LABELS, CUSTOMER_TYPE_LABELS, ORDER_CHANNEL_LABELS } from "@/lib/constants";
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { BarList, TimeSeriesChart } from "@/components/charts";
import { RangeTabs, sp, StatTile } from "@/components/admin/bits";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage(props: PageProps<"/admin/analytics">) {
  await requireStaff("analytics:view");
  const range = rangeFromPreset(sp((await props.searchParams).range) ?? "90d");
  const prev = previousRange(range);
  const cur = (await getSettings()).commerce.currency;
  const [sales, prevSales, series, insights, custs, channels, fulfil, campaigns, top, sources] = await Promise.all([
    salesSummary(range),
    salesSummary(prev),
    dailySeries(range),
    customerInsights(range),
    newCustomers(range),
    breakdown(range, "channel"),
    breakdown(range, "fulfillment_type"),
    campaignPerformance(range),
    topProducts(range, 10),
    db.execute<{ source: string; orders: number; revenue: number }>(sql`
      select coalesce(nullif(utm_source, ''), 'direct / unknown') as source, count(*)::int as orders, sum(total)::bigint as revenue
      from orders where status <> 'CANCELLED' and created_at::date between ${range.from}::date and ${range.to}::date group by 1 order by 3 desc limit 10`),
  ]);
  const returningShare = insights.firstTime + insights.returning ? insights.returning / (insights.firstTime + insights.returning) : 0;

  return (
    <>
      <PageHeader title="Analytics" description="Sales trends, customer behaviour, channels and marketing attribution." actions={<RangeTabs active={range.preset} base="/admin/analytics" />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Revenue" value={formatMoney(sales.revenue, cur)} delta={pctChange(sales.revenue, prevSales.revenue)} />
        <StatTile label="Orders" value={String(sales.orders)} delta={pctChange(sales.orders, prevSales.orders)} />
        <StatTile label="Buyers" value={String(sales.buyers)} delta={pctChange(sales.buyers, prevSales.buyers)} />
        <StatTile label="New customers" value={String(custs)} />
        <StatTile label="Returning buyers" value={formatPercent(returningShare, 0)} hint={`${insights.returning} of ${insights.firstTime + insights.returning}`} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Orders over time" />
        <CardBody><TimeSeriesChart labels={series.points.map((p) => p.date)} bucket={series.bucket} format="number" series={[{ key: "orders", label: "Orders", values: series.points.map((p) => p.orders), kind: "area" }]} /></CardBody>
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Revenue by channel" /><CardBody><BarList items={channels.map((c) => ({ label: ORDER_CHANNEL_LABELS[c.key as keyof typeof ORDER_CHANNEL_LABELS] ?? c.key, value: c.revenue, hint: `${c.orders} orders` }))} currency={cur} /></CardBody></Card>
        <Card><CardHeader title="Traffic source (UTM)" /><CardBody><BarList items={sources.rows.map((s) => ({ label: s.source, value: Number(s.revenue), hint: `${s.orders} orders` }))} currency={cur} /></CardBody></Card>
        <Card><CardHeader title="Customer types" /><CardBody><BarList items={insights.byType.map((t) => ({ label: CUSTOMER_TYPE_LABELS[t.key as keyof typeof CUSTOMER_TYPE_LABELS] ?? t.key, value: t.revenue, hint: `${t.customers} customers` }))} currency={cur} /></CardBody></Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top customers" />
          <Table>
            <thead><tr><Th>Customer</Th><Th align="right">Orders</Th><Th align="right">Revenue</Th></tr></thead>
            <tbody>{insights.top.map((c) => <tr key={c.id}><Td><Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link></Td><Td align="right">{c.orders}</Td><Td align="right" className="font-semibold">{formatMoney(c.revenue, cur)}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Product performance" />
          <Table>
            <thead><tr><Th>Product</Th><Th align="right">Revenue</Th><Th align="right">Margin</Th></tr></thead>
            <tbody>{top.map((p) => <tr key={p.name}><Td className="font-medium">{p.name}</Td><Td align="right">{formatMoney(p.revenue, cur)}</Td><Td align="right" className="text-muted">{p.cost ? formatPercent((p.revenue - p.cost) / p.revenue, 0) : "—"}</Td></tr>)}</tbody>
          </Table>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Marketing campaigns" description="Orders attributed by UTM link or campaign promo code." action={<Link href="/admin/campaigns" className="link text-sm">Manage</Link>} />
        <Table>
          <thead><tr><Th>Campaign</Th><Th align="right">Spend</Th><Th align="right">Clicks</Th><Th align="right">Orders</Th><Th align="right">Revenue</Th><Th align="right">ROAS</Th><Th align="right">Cost / order</Th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}><Td><Link href={`/admin/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link><p className="text-xs text-muted">{CAMPAIGN_CHANNEL_LABELS[c.channel as keyof typeof CAMPAIGN_CHANNEL_LABELS]}</p></Td><Td align="right">{formatMoney(c.spend, cur)}</Td><Td align="right">{c.clicks.toLocaleString()}</Td><Td align="right">{c.orders}</Td><Td align="right">{formatMoney(c.revenue, cur)}</Td><Td align="right" className="font-semibold">{c.roas !== null ? `${c.roas.toFixed(1)}×` : "—"}</Td><Td align="right">{c.cpa !== null ? formatMoney(c.cpa, cur) : "—"}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="mt-4 text-xs text-muted">Delivery vs pickup: {fulfil.map((f) => `${f.key.toLowerCase()} ${f.orders}`).join(" · ")}</p>
    </>
  );
}
