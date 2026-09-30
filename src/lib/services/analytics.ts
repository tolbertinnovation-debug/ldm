import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Reporting queries. Date ranges are inclusive ISO dates ("YYYY-MM-DD")
 * interpreted in the business time zone (Liberia is UTC+0).
 */
export const REPORT_TZ = process.env.REPORT_TZ ?? "Africa/Monrovia";

export type DateRange = { from: string; to: string };

const localDate = (col: string) => sql.raw(`(${col} at time zone '${REPORT_TZ.replace(/'/g, "")}')::date`);

function rows<T>(result: { rows: unknown[] }) {
  return result.rows as T[];
}

const num = (v: unknown) => Number(v ?? 0);

export function rangeFromPreset(preset: string | undefined, now = new Date()): DateRange & { label: string; preset: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (days: number) => new Date(today.getTime() - days * 86_400_000);
  switch (preset) {
    case "today":
      return { from: iso(today), to: iso(today), label: "Today", preset };
    case "7d":
      return { from: iso(back(6)), to: iso(today), label: "Last 7 days", preset };
    case "90d":
      return { from: iso(back(89)), to: iso(today), label: "Last 90 days", preset };
    case "mtd":
      return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to: iso(today), label: "Month to date", preset };
    case "lm": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { from: iso(start), to: iso(end), label: "Last month", preset };
    }
    case "ytd":
      return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))), to: iso(today), label: "Year to date", preset };
    case "12m":
      return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1))), to: iso(today), label: "Last 12 months", preset };
    default:
      return { from: iso(back(29)), to: iso(today), label: "Last 30 days", preset: "30d" };
  }
}

/** Same-length window immediately before the range, for period-over-period deltas. */
export function previousRange(r: DateRange): DateRange {
  const from = new Date(`${r.from}T00:00:00Z`).getTime();
  const to = new Date(`${r.to}T00:00:00Z`).getTime();
  const len = to - from + 86_400_000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: iso(from - len), to: iso(from - 86_400_000) };
}

export async function salesSummary(r: DateRange) {
  const res = await db.execute(sql`
    select
      count(*) filter (where status <> 'CANCELLED')::int as orders,
      coalesce(sum(total) filter (where status <> 'CANCELLED'), 0)::bigint as revenue,
      coalesce(sum(subtotal) filter (where status <> 'CANCELLED'), 0)::bigint as gross,
      coalesce(sum(discount_total) filter (where status <> 'CANCELLED'), 0)::bigint as discounts,
      coalesce(sum(delivery_fee) filter (where status <> 'CANCELLED'), 0)::bigint as delivery,
      coalesce(sum(tax_total) filter (where status <> 'CANCELLED'), 0)::bigint as tax,
      count(*) filter (where status = 'CANCELLED')::int as cancelled,
      count(distinct customer_id) filter (where status <> 'CANCELLED')::int as buyers
    from orders
    where ${localDate("created_at")} between ${r.from}::date and ${r.to}::date
  `);
  const row = res.rows[0] as Record<string, unknown>;
  const orders = num(row.orders);
  const revenue = num(row.revenue);
  return {
    orders,
    revenue,
    gross: num(row.gross),
    discounts: num(row.discounts),
    delivery: num(row.delivery),
    tax: num(row.tax),
    cancelled: num(row.cancelled),
    buyers: num(row.buyers),
    aov: orders ? Math.round(revenue / orders) : 0,
  };
}

export async function cashSummary(r: DateRange) {
  const res = await db.execute(sql`
    select
      coalesce(sum(amount) filter (where kind = 'PAYMENT'), 0)::bigint as cash_in,
      coalesce(sum(amount) filter (where kind = 'REFUND'), 0)::bigint as refunds
    from payments
    where status = 'SUCCEEDED' and ${localDate("paid_at")} between ${r.from}::date and ${r.to}::date
  `);
  const exp = await db.execute(sql`
    select coalesce(sum(amount), 0)::bigint as expenses from expenses where date between ${r.from}::date and ${r.to}::date
  `);
  const row = res.rows[0] as Record<string, unknown>;
  const cashIn = num(row.cash_in);
  const refunds = num(row.refunds);
  const expenses = num((exp.rows[0] as Record<string, unknown>).expenses);
  return { cashIn, refunds, expenses, net: cashIn - refunds - expenses };
}

export async function newCustomers(r: DateRange) {
  const res = await db.execute(sql`
    select count(*)::int as n from customers where ${localDate("created_at")} between ${r.from}::date and ${r.to}::date
  `);
  return num((res.rows[0] as Record<string, unknown>).n);
}

export type DailyPoint = { date: string; revenue: number; orders: number; cashIn: number; expenses: number };

/** Daily (or monthly for long ranges) series with zero-filled gaps. */
export async function dailySeries(r: DateRange): Promise<{ bucket: "day" | "month"; points: DailyPoint[] }> {
  const days = (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000 + 1;
  const bucket = days > 120 ? "month" : "day";
  const trunc = bucket === "month" ? sql.raw(`'month'`) : sql.raw(`'day'`);
  const step = bucket === "month" ? sql.raw(`'1 month'`) : sql.raw(`'1 day'`);
  const res = await db.execute(sql`
    with buckets as (
      select generate_series(date_trunc(${trunc}, ${r.from}::date), ${r.to}::date, ${step}::interval)::date as d
    ),
    o as (
      select date_trunc(${trunc}, ${localDate("created_at")})::date as d, sum(total)::bigint as revenue, count(*)::int as orders
      from orders where status <> 'CANCELLED' and ${localDate("created_at")} between ${r.from}::date and ${r.to}::date group by 1
    ),
    p as (
      select date_trunc(${trunc}, ${localDate("paid_at")})::date as d,
        sum(case when kind = 'PAYMENT' then amount else -amount end)::bigint as cash_in
      from payments where status = 'SUCCEEDED' and ${localDate("paid_at")} between ${r.from}::date and ${r.to}::date group by 1
    ),
    e as (
      select date_trunc(${trunc}, date)::date as d, sum(amount)::bigint as expenses
      from expenses where date between ${r.from}::date and ${r.to}::date group by 1
    )
    select to_char(b.d, 'YYYY-MM-DD') as date, coalesce(o.revenue, 0) as revenue, coalesce(o.orders, 0) as orders,
      coalesce(p.cash_in, 0) as cash_in, coalesce(e.expenses, 0) as expenses
    from buckets b left join o on o.d = b.d left join p on p.d = b.d left join e on e.d = b.d
    order by b.d
  `);
  return {
    bucket,
    points: rows<Record<string, unknown>>(res).map((x) => ({
      date: String(x.date),
      revenue: num(x.revenue),
      orders: num(x.orders),
      cashIn: num(x.cash_in),
      expenses: num(x.expenses),
    })),
  };
}

export async function salesByCategory(r: DateRange) {
  const res = await db.execute(sql`
    select coalesce(c.name, 'Uncategorised') as name, sum(oi.line_total)::bigint as revenue, sum(oi.quantity)::float as qty
    from order_items oi
    join orders o on o.id = oi.order_id and o.status <> 'CANCELLED'
    left join products p on p.id = oi.product_id
    left join categories c on c.id = p.category_id
    where ${localDate("o.created_at")} between ${r.from}::date and ${r.to}::date
    group by 1 order by 2 desc
  `);
  return rows<Record<string, unknown>>(res).map((x) => ({ name: String(x.name), revenue: num(x.revenue), qty: num(x.qty) }));
}

export async function topProducts(r: DateRange, limit = 10) {
  const res = await db.execute(sql`
    select oi.product_id as id, oi.name, oi.unit, sum(oi.quantity)::float as qty, sum(oi.line_total)::bigint as revenue,
      sum(coalesce(oi.unit_cost, 0) * oi.quantity)::bigint as cost, count(distinct o.id)::int as orders
    from order_items oi join orders o on o.id = oi.order_id and o.status <> 'CANCELLED'
    where ${localDate("o.created_at")} between ${r.from}::date and ${r.to}::date
    group by 1, 2, 3 order by revenue desc limit ${limit}
  `);
  return rows<Record<string, unknown>>(res).map((x) => ({
    id: x.id as string | null,
    name: String(x.name),
    unit: String(x.unit),
    qty: num(x.qty),
    revenue: num(x.revenue),
    cost: num(x.cost),
    orders: num(x.orders),
  }));
}

export async function breakdown(r: DateRange, column: "channel" | "fulfillment_type" | "status" | "payment_method") {
  const col = sql.raw(column);
  const res = await db.execute(sql`
    select coalesce(${col}::text, 'UNKNOWN') as key, count(*)::int as orders, sum(total)::bigint as revenue
    from orders where ${localDate("created_at")} between ${r.from}::date and ${r.to}::date
    ${column === "status" ? sql`` : sql`and status <> 'CANCELLED'`}
    group by 1 order by 3 desc nulls last
  `);
  return rows<Record<string, unknown>>(res).map((x) => ({ key: String(x.key), orders: num(x.orders), revenue: num(x.revenue) }));
}

export async function paymentsByMethod(r: DateRange) {
  const res = await db.execute(sql`
    select method as key, sum(case when kind = 'PAYMENT' then amount else -amount end)::bigint as amount, count(*)::int as n
    from payments where status = 'SUCCEEDED' and ${localDate("paid_at")} between ${r.from}::date and ${r.to}::date
    group by 1 order by 2 desc
  `);
  return rows<Record<string, unknown>>(res).map((x) => ({ key: String(x.key), amount: num(x.amount), count: num(x.n) }));
}

export async function expensesByCategory(r: DateRange) {
  const res = await db.execute(sql`
    select category as name, sum(amount)::bigint as amount, count(*)::int as n
    from expenses where date between ${r.from}::date and ${r.to}::date group by 1 order by 2 desc
  `);
  return rows<Record<string, unknown>>(res).map((x) => ({ name: String(x.name), amount: num(x.amount), count: num(x.n) }));
}

/** Profit & loss on a sales (accrual) basis, with COGS from recorded unit costs. */
export async function profitAndLoss(r: DateRange) {
  const sales = await salesSummary(r);
  const cogsRes = await db.execute(sql`
    select coalesce(sum(round(coalesce(oi.unit_cost, 0) * oi.quantity)), 0)::bigint as cogs
    from order_items oi join orders o on o.id = oi.order_id and o.status <> 'CANCELLED'
    where ${localDate("o.created_at")} between ${r.from}::date and ${r.to}::date
  `);
  const refundsRes = await db.execute(sql`
    select coalesce(sum(amount), 0)::bigint as refunds from payments
    where kind = 'REFUND' and status = 'SUCCEEDED' and ${localDate("paid_at")} between ${r.from}::date and ${r.to}::date
  `);
  const expenseLines = await expensesByCategory(r);
  const cogs = num((cogsRes.rows[0] as Record<string, unknown>).cogs);
  const refunds = num((refundsRes.rows[0] as Record<string, unknown>).refunds);
  const netSales = sales.gross - sales.discounts - refunds;
  const revenue = netSales + sales.delivery;
  const grossProfit = revenue - cogs;
  const operating = expenseLines.reduce((a, e) => a + e.amount, 0);
  return {
    grossSales: sales.gross,
    discounts: sales.discounts,
    refunds,
    netSales,
    deliveryIncome: sales.delivery,
    revenue,
    taxCollected: sales.tax,
    cogs,
    grossProfit,
    grossMargin: revenue ? grossProfit / revenue : 0,
    expenses: expenseLines,
    operatingExpenses: operating,
    netProfit: grossProfit - operating,
  };
}

/** Outstanding balances by age (orders on credit + unpaid invoices not tied to an order). */
export async function receivablesAging() {
  const res = await db.execute(sql`
    with open_items as (
      select o.customer_id, o.total - o.amount_paid as due, (current_date - ${localDate("o.created_at")}) as age
      from orders o where o.status <> 'CANCELLED' and o.payment_status in ('UNPAID','PARTIALLY_PAID') and o.total > o.amount_paid
      union all
      select i.customer_id, i.total - i.amount_paid, (current_date - i.due_date)
      from invoices i where i.order_id is null and i.status in ('SENT','PARTIALLY_PAID') and i.total > i.amount_paid
    )
    select
      coalesce(sum(due) filter (where age <= 7), 0)::bigint as d0,
      coalesce(sum(due) filter (where age between 8 and 30), 0)::bigint as d8,
      coalesce(sum(due) filter (where age between 31 and 60), 0)::bigint as d31,
      coalesce(sum(due) filter (where age > 60), 0)::bigint as d61,
      coalesce(sum(due), 0)::bigint as total,
      count(distinct customer_id)::int as customers
    from open_items
  `);
  const x = res.rows[0] as Record<string, unknown>;
  return {
    buckets: [
      { label: "0–7 days", amount: num(x.d0) },
      { label: "8–30 days", amount: num(x.d8) },
      { label: "31–60 days", amount: num(x.d31) },
      { label: "60+ days", amount: num(x.d61) },
    ],
    total: num(x.total),
    customers: num(x.customers),
  };
}

export async function inventoryValuation() {
  const res = await db.execute(sql`
    select c.name as category,
      coalesce(sum(greatest(p.stock_qty, 0) * coalesce(p.cost_price, 0)), 0)::bigint as cost_value,
      coalesce(sum(greatest(p.stock_qty, 0) * p.price), 0)::bigint as retail_value,
      count(*)::int as products
    from products p left join categories c on c.id = p.category_id
    where p.type = 'PRODUCT' and p.status <> 'ARCHIVED' and p.track_inventory
    group by 1 order by 3 desc
  `);
  return rows<Record<string, unknown>>(res).map((x) => ({
    category: (x.category as string | null) ?? "Uncategorised",
    costValue: num(x.cost_value),
    retailValue: num(x.retail_value),
    products: num(x.products),
  }));
}

export async function campaignPerformance(r?: DateRange) {
  const res = await db.execute(sql`
    select c.id, c.name, c.channel, c.status, c.budget, c.utm_campaign,
      coalesce(m.spend, 0)::bigint as spend, coalesce(m.impressions, 0)::bigint as impressions,
      coalesce(m.clicks, 0)::bigint as clicks, coalesce(m.leads, 0)::bigint as leads,
      coalesce(o.orders, 0)::int as orders, coalesce(o.revenue, 0)::bigint as revenue, coalesce(o.customers, 0)::int as customers
    from campaigns c
    left join (
      select campaign_id, sum(spend) as spend, sum(impressions) as impressions, sum(clicks) as clicks, sum(leads) as leads
      from campaign_metrics ${r ? sql`where date between ${r.from}::date and ${r.to}::date` : sql``} group by 1
    ) m on m.campaign_id = c.id
    left join (
      select campaign_id, count(*) as orders, sum(total) as revenue, count(distinct customer_id) as customers
      from orders where status <> 'CANCELLED' and campaign_id is not null
      ${r ? sql`and ${localDate("created_at")} between ${r.from}::date and ${r.to}::date` : sql``}
      group by 1
    ) o on o.campaign_id = c.id
    order by c.created_at desc
  `);
  return rows<Record<string, unknown>>(res).map((x) => {
    const spend = num(x.spend);
    const revenue = num(x.revenue);
    const clicks = num(x.clicks);
    const impressions = num(x.impressions);
    const orders = num(x.orders);
    return {
      id: String(x.id),
      name: String(x.name),
      channel: String(x.channel),
      status: String(x.status),
      budget: num(x.budget),
      utmCampaign: String(x.utm_campaign),
      spend,
      impressions,
      clicks,
      leads: num(x.leads),
      orders,
      revenue,
      customers: num(x.customers),
      roas: spend ? revenue / spend : null,
      cpa: orders ? Math.round(spend / orders) : null,
      ctr: impressions ? clicks / impressions : null,
      cpc: clicks ? Math.round(spend / clicks) : null,
    };
  });
}

export async function customerInsights(r: DateRange) {
  const res = await db.execute(sql`
    with first_orders as (
      select customer_id, min(created_at) as first_at from orders where status <> 'CANCELLED' group by 1
    )
    select
      count(distinct o.customer_id) filter (where ${localDate("f.first_at")} between ${r.from}::date and ${r.to}::date)::int as first_time,
      count(distinct o.customer_id) filter (where ${localDate("f.first_at")} < ${r.from}::date)::int as returning
    from orders o join first_orders f on f.customer_id = o.customer_id
    where o.status <> 'CANCELLED' and ${localDate("o.created_at")} between ${r.from}::date and ${r.to}::date
  `);
  const x = res.rows[0] as Record<string, unknown>;
  const top = await db.execute(sql`
    select c.id, c.name, c.phone, c.type, count(o.id)::int as orders, sum(o.total)::bigint as revenue
    from orders o join customers c on c.id = o.customer_id
    where o.status <> 'CANCELLED' and ${localDate("o.created_at")} between ${r.from}::date and ${r.to}::date
    group by 1, 2, 3, 4 order by revenue desc limit 10
  `);
  const types = await db.execute(sql`
    select c.type as key, count(distinct c.id)::int as customers, sum(o.total)::bigint as revenue
    from orders o join customers c on c.id = o.customer_id
    where o.status <> 'CANCELLED' and ${localDate("o.created_at")} between ${r.from}::date and ${r.to}::date
    group by 1 order by 3 desc
  `);
  return {
    firstTime: num(x.first_time),
    returning: num(x.returning),
    top: rows<Record<string, unknown>>(top).map((t) => ({
      id: String(t.id),
      name: String(t.name),
      phone: t.phone as string | null,
      type: String(t.type),
      orders: num(t.orders),
      revenue: num(t.revenue),
    })),
    byType: rows<Record<string, unknown>>(types).map((t) => ({ key: String(t.key), customers: num(t.customers), revenue: num(t.revenue) })),
  };
}

export async function deliveryPerformance(r: DateRange) {
  const res = await db.execute(sql`
    select u.name as driver,
      count(*) filter (where d.status = 'DELIVERED')::int as delivered,
      count(*) filter (where d.status = 'FAILED')::int as failed,
      coalesce(avg(extract(epoch from (d.delivered_at - o.created_at)) / 3600) filter (where d.status = 'DELIVERED'), 0)::float as avg_hours,
      coalesce(sum(d.cod_collected), 0)::bigint as cod
    from deliveries d join orders o on o.id = d.order_id left join users u on u.id = d.driver_id
    where ${localDate("o.created_at")} between ${r.from}::date and ${r.to}::date
    group by 1 order by 2 desc
  `);
  return rows<Record<string, unknown>>(res).map((x) => ({
    driver: (x.driver as string | null) ?? "Unassigned",
    delivered: num(x.delivered),
    failed: num(x.failed),
    avgHours: num(x.avg_hours),
    cod: num(x.cod),
  }));
}

export function pctChange(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return (current - previous) / Math.abs(previous);
}
