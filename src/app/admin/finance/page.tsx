import { Download } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatPercent } from "@/lib/format";
import { cashSummary, dailySeries, inventoryValuation, paymentsByMethod, pctChange, previousRange, profitAndLoss, rangeFromPreset, receivablesAging } from "@/lib/services/analytics";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { ButtonLink, Card, CardBody, CardHeader, PageHeader, cn } from "@/components/ui";
import { BarList, ColumnChart, TimeSeriesChart } from "@/components/charts";
import { PrintButton } from "@/components/print-button";
import { RangeTabs, sp, StatTile } from "@/components/admin/bits";

export const metadata = { title: "Financial reports" };

function Row({ label, value, bold, indent, negative, cur, border }: { label: string; value: number; bold?: boolean; indent?: boolean; negative?: boolean; cur: string; border?: boolean }) {
  return (
    <div className={cn("flex justify-between py-2 text-sm", bold && "font-bold", border && "border-t border-border", indent && "pl-4 text-muted")}>
      <span>{label}</span>
      <span className="tabular">{negative && value ? `(${formatMoney(value, cur)})` : formatMoney(value, cur)}</span>
    </div>
  );
}

export default async function FinancePage(props: PageProps<"/admin/finance">) {
  const user = await requireStaff("finance:view");
  const range = rangeFromPreset(sp((await props.searchParams).range) ?? "mtd");
  const prev = previousRange(range);
  const settings = await getSettings();
  const cur = settings.commerce.currency;
  const [pl, plPrev, cash, series, methods, aging, stock] = await Promise.all([profitAndLoss(range), profitAndLoss(prev), cashSummary(range), dailySeries(range), paymentsByMethod(range), receivablesAging(), inventoryValuation()]);
  const stockValue = stock.reduce((a, s) => a + s.costValue, 0);

  return (
    <>
      <PageHeader
        title="Financial reports"
        description={`Profit & loss, cash flow and what you're owed — ${range.label.toLowerCase()} (${range.from} to ${range.to}).`}
        actions={
          <>
            <RangeTabs active={range.preset} base="/admin/finance" />
            {can(user.role, "reports:view") && <ButtonLink href={`/api/admin/export/pnl?from=${range.from}&to=${range.to}`} variant="outline" size="sm"><Download className="h-4 w-4" aria-hidden /> P&amp;L CSV</ButtonLink>}
            <PrintButton />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Revenue" value={formatMoney(pl.revenue, cur)} delta={pctChange(pl.revenue, plPrev.revenue)} />
        <StatTile label="Gross profit" value={formatMoney(pl.grossProfit, cur)} hint={`${formatPercent(pl.grossMargin, 0)} margin`} delta={pctChange(pl.grossProfit, plPrev.grossProfit)} />
        <StatTile label="Expenses" value={formatMoney(pl.operatingExpenses, cur)} delta={pctChange(pl.operatingExpenses, plPrev.operatingExpenses)} invert />
        <StatTile label="Net profit" value={formatMoney(pl.netProfit, cur)} delta={pctChange(pl.netProfit, plPrev.netProfit)} />
        <StatTile label="Owed to you" value={formatMoney(aging.total, cur)} hint={`${aging.customers} customers`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Profit & loss" description="Sales basis: orders placed in the period (excluding cancelled)." />
          <CardBody className="divide-y divide-transparent">
            <Row label="Gross sales" value={pl.grossSales} cur={cur} />
            <Row label="Discounts" value={pl.discounts} indent negative cur={cur} />
            <Row label="Refunds" value={pl.refunds} indent negative cur={cur} />
            <Row label="Net product sales" value={pl.netSales} cur={cur} border />
            <Row label="Delivery income" value={pl.deliveryIncome} cur={cur} />
            <Row label="Total revenue" value={pl.revenue} bold cur={cur} border />
            <Row label="Cost of goods sold" value={pl.cogs} negative cur={cur} />
            <Row label="Gross profit" value={pl.grossProfit} bold cur={cur} border />
            {pl.expenses.map((e) => <Row key={e.name} label={e.name} value={e.amount} indent negative cur={cur} />)}
            <Row label="Operating expenses" value={pl.operatingExpenses} negative cur={cur} border />
            <div className={cn("mt-2 flex justify-between rounded-xl px-3 py-3 text-base font-bold", pl.netProfit >= 0 ? "bg-success-soft text-success-fg" : "bg-danger-soft text-danger-fg")}>
              <span>Net profit</span>
              <span className="tabular">{formatMoney(pl.netProfit, cur)}</span>
            </div>
            {pl.taxCollected > 0 && <p className="pt-3 text-xs text-muted">{settings.commerce.taxLabel} collected (payable, not income): {formatMoney(pl.taxCollected, cur)}</p>}
            <p className="pt-2 text-xs text-muted">COGS uses each product&apos;s cost price at the time of sale. Set cost prices on products for accurate margins.</p>
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Cash flow" description="Money actually received and spent." />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-success-soft p-3"><p className="text-xs text-success-fg">Cash in</p><p className="tabular font-bold text-success-fg">{formatMoney(cash.cashIn - cash.refunds, cur)}</p></div>
                <div className="rounded-xl bg-danger-soft p-3"><p className="text-xs text-danger-fg">Cash out</p><p className="tabular font-bold text-danger-fg">{formatMoney(cash.expenses, cur)}</p></div>
                <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Net cash</p><p className="tabular font-bold">{formatMoney(cash.net, cur)}</p></div>
              </div>
              <TimeSeriesChart labels={series.points.map((p) => p.date)} bucket={series.bucket} currency={cur} height={200} series={[{ key: "in", label: "Cash in", values: series.points.map((p) => p.cashIn), kind: "area" }, { key: "out", label: "Expenses", values: series.points.map((p) => p.expenses), kind: "line" }]} />
            </CardBody>
          </Card>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader title="Cash in by method" />
              <CardBody><BarList items={methods.map((m) => ({ label: PAYMENT_METHOD_LABELS[m.key as keyof typeof PAYMENT_METHOD_LABELS] ?? m.key, value: m.amount }))} currency={cur} /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Receivables aging" />
              <CardBody><ColumnChart items={aging.buckets.map((b) => ({ label: b.label, value: b.amount }))} currency={cur} height={140} /></CardBody>
            </Card>
          </div>
          <Card className="p-5">
            <p className="text-sm text-muted">Inventory on hand (at cost)</p>
            <p className="tabular text-2xl font-bold">{formatMoney(stockValue, cur)}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
