import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { categories, products, stockMovements, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { formatQuantity, STOCK_MOVEMENT_LABELS } from "@/lib/constants";
import { inventoryValuation } from "@/lib/services/analytics";
import { Badge, ButtonLink, Card, CardHeader, PageHeader, Table, Tabs, Td, Th } from "@/components/ui";
import { StockForm } from "@/components/admin/stock-form";
import { StatTile, sp } from "@/components/admin/bits";

export const metadata = { title: "Inventory" };

export default async function InventoryPage(props: PageProps<"/admin/inventory">) {
  const user = await requireStaff("inventory:view");
  const params = await props.searchParams;
  const filter = sp(params.filter) ?? "all";
  const cur = (await getSettings()).commerce.currency;
  const [rows, valuation, moves] = await Promise.all([
    db
      .select({ p: products, cat: categories.name })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(eq(products.type, "PRODUCT"), eq(products.trackInventory, true), sql`${products.status} <> 'ARCHIVED'`, filter === "low" ? sql`${products.stockQty} <= ${products.lowStockThreshold}` : filter === "out" ? sql`${products.stockQty} <= 0` : undefined))
      .orderBy(asc(categories.sortOrder), asc(products.name)),
    inventoryValuation(),
    db.select({ m: stockMovements, name: products.name, unit: products.unit, by: users.name }).from(stockMovements).innerJoin(products, eq(products.id, stockMovements.productId)).leftJoin(users, eq(users.id, stockMovements.createdById)).orderBy(desc(stockMovements.createdAt)).limit(25),
  ]);
  const totalCost = valuation.reduce((a, v) => a + v.costValue, 0);
  const totalRetail = valuation.reduce((a, v) => a + v.retailValue, 0);
  const manage = can(user.role, "inventory:manage");
  return (
    <>
      <PageHeader title="Inventory" description="Stock on hand, low-stock alerts, receiving, stock counts and the full movement ledger." actions={can(user.role, "reports:view") && <ButtonLink href="/api/admin/export/inventory" variant="outline" size="sm"><Download className="h-4 w-4" aria-hidden /> Export</ButtonLink>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Stock value (cost)" value={formatMoney(totalCost, cur)} />
        <StatTile label="Stock value (retail)" value={formatMoney(totalRetail, cur)} />
        <StatTile label="Low stock" value={String(rows.filter((r) => r.p.stockQty <= r.p.lowStockThreshold && r.p.stockQty > 0).length)} href="/admin/inventory?filter=low" />
        <StatTile label="Sold out" value={String(rows.filter((r) => r.p.stockQty <= 0).length)} href="/admin/inventory?filter=out" />
      </div>
      <Tabs active={filter} tabs={[{ key: "all", label: "All tracked", href: "/admin/inventory" }, { key: "low", label: "Low stock", href: "/admin/inventory?filter=low" }, { key: "out", label: "Sold out", href: "/admin/inventory?filter=out" }]} />
      <Card className="mt-4">
        <Table>
          <thead><tr><Th>Product</Th><Th align="right">On hand</Th><Th align="right">Alert at</Th><Th align="right">Value</Th>{manage && <Th>Update</Th>}</tr></thead>
          <tbody>
            {rows.map(({ p, cat }) => (
              <tr key={p.id}>
                <Td><Link href={`/admin/products/${p.id}`} className="font-semibold hover:underline">{p.name}</Link><p className="text-xs text-muted">{cat}</p></Td>
                <Td align="right">
                  <span className="font-semibold">{formatQuantity(p.stockQty, p.unit)}</span>
                  {p.stockQty <= 0 ? <Badge tone="danger" className="ml-2">Out</Badge> : p.stockQty <= p.lowStockThreshold ? <Badge tone="warning" className="ml-2">Low</Badge> : null}
                </Td>
                <Td align="right" className="text-muted">{p.lowStockThreshold}</Td>
                <Td align="right" className="text-muted">{formatMoney(Math.round(Math.max(0, p.stockQty) * (p.costPrice ?? 0)), cur)}</Td>
                {manage && <Td><StockForm productId={p.id} unit={p.unit.toLowerCase()} compact /></Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Recent stock movements" />
        <Table>
          <thead><tr><Th>When</Th><Th>Product</Th><Th>Type</Th><Th align="right">Change</Th><Th align="right">Balance</Th><Th>Reference</Th><Th>By</Th></tr></thead>
          <tbody>
            {moves.map(({ m, name, by }) => (
              <tr key={m.id}>
                <Td className="text-muted">{formatDateTime(m.createdAt)}</Td>
                <Td className="font-medium">{name}</Td>
                <Td>{STOCK_MOVEMENT_LABELS[m.type]}</Td>
                <Td align="right" className={m.quantity < 0 ? "text-danger-fg" : "text-success-fg"}>{m.quantity > 0 ? "+" : ""}{m.quantity}</Td>
                <Td align="right">{m.balanceAfter}</Td>
                <Td className="text-muted">{[m.reference, m.note].filter(Boolean).join(" · ") || "—"}</Td>
                <Td className="text-muted">{by ?? "System"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
