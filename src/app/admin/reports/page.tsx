import { Download, FileSpreadsheet } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatQuantity } from "@/lib/constants";
import { rangeFromPreset, salesByCategory, salesSummary, topProducts } from "@/lib/services/analytics";
import { ButtonLink, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { RangeTabs, sp, StatTile } from "@/components/admin/bits";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/admin/reports">) {
  await requireStaff("reports:view");
  const range = rangeFromPreset(sp((await props.searchParams).range) ?? "30d");
  const cur = (await getSettings()).commerce.currency;
  const [sales, cats, products] = await Promise.all([salesSummary(range), salesByCategory(range), topProducts(range, 100)]);
  const q = `from=${range.from}&to=${range.to}`;
  const exports = [
    { href: `/api/admin/export/orders?${q}`, label: "Orders", text: "Every order with totals, payment status, channel and campaign." },
    { href: `/api/admin/export/payments?${q}`, label: "Payments", text: "All payments and refunds by method with references." },
    { href: `/api/admin/export/expenses?${q}`, label: "Expenses", text: "Expense ledger by category, vendor and method." },
    { href: `/api/admin/export/pnl?${q}`, label: "Profit & loss", text: "P&L summary for your accountant." },
    { href: `/api/admin/export/inventory`, label: "Inventory", text: "Current stock, cost and value per product." },
    { href: `/api/admin/export/customers`, label: "Customers", text: "Customer list with lifetime value and consent." },
  ];
  return (
    <>
      <PageHeader title="Reports & exports" description={`Sales report for ${range.label.toLowerCase()} and CSV exports for Excel / Google Sheets.`} actions={<><RangeTabs active={range.preset} base="/admin/reports" /><PrintButton /></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Net sales" value={formatMoney(sales.revenue, cur)} />
        <StatTile label="Orders" value={String(sales.orders)} />
        <StatTile label="Discounts given" value={formatMoney(sales.discounts, cur)} />
        <StatTile label="Delivery fees" value={formatMoney(sales.delivery, cur)} />
      </div>
      <Card className="mt-6 no-print">
        <CardHeader title="Download data" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exports.map((e) => (
            <div key={e.label} className="flex items-start gap-3 rounded-xl border border-border p-4">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div className="flex-1"><p className="font-semibold">{e.label}</p><p className="text-sm text-muted">{e.text}</p></div>
              <ButtonLink href={e.href} variant="outline" size="sm"><Download className="h-4 w-4" aria-hidden /><span className="sr-only">Download {e.label}</span></ButtonLink>
            </div>
          ))}
        </CardBody>
      </Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Sales by product" />
          <Table>
            <thead><tr><Th>Product</Th><Th align="right">Qty sold</Th><Th align="right">Orders</Th><Th align="right">Revenue</Th><Th align="right">Cost</Th><Th align="right">Gross profit</Th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.name}><Td className="font-medium">{p.name}</Td><Td align="right">{formatQuantity(Math.round(p.qty * 100) / 100, p.unit)}</Td><Td align="right">{p.orders}</Td><Td align="right">{formatMoney(p.revenue, cur)}</Td><Td align="right" className="text-muted">{formatMoney(p.cost, cur)}</Td><Td align="right" className="font-semibold">{formatMoney(p.revenue - p.cost, cur)}</Td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title="By category" />
          <Table>
            <thead><tr><Th>Category</Th><Th align="right">Revenue</Th></tr></thead>
            <tbody>{cats.map((c) => <tr key={c.name}><Td>{c.name}</Td><Td align="right" className="font-semibold">{formatMoney(c.revenue, cur)}</Td></tr>)}</tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
