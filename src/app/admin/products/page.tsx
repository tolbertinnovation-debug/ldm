import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Package, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatQuantity, UNIT_LABELS, type SalesUnit } from "@/lib/constants";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Tabs, Td, Th } from "@/components/ui";
import { ProductImage } from "@/components/shop/visuals";
import { CategoryForm } from "@/components/admin/category-form";
import { sp } from "@/components/admin/bits";

export const metadata = { title: "Products" };

export default async function ProductsPage(props: PageProps<"/admin/products">) {
  const user = await requireStaff("products:view");
  const params = await props.searchParams;
  const q = sp(params.q)?.trim();
  const cat = sp(params.category);
  const status = sp(params.status) ?? "ACTIVE";
  const cur = (await getSettings()).commerce.currency;
  const conds: SQL[] = [];
  if (status !== "ALL") conds.push(eq(products.status, status as "ACTIVE"));
  if (cat) conds.push(eq(products.categoryId, cat));
  if (q) conds.push(or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`))!);
  const [rows, cats, sold] = await Promise.all([
    db.select({ p: products, catName: categories.name, icon: categories.icon }).from(products).leftJoin(categories, eq(categories.id, products.categoryId)).where(conds.length ? and(...conds) : undefined).orderBy(asc(categories.sortOrder), asc(products.sortOrder)),
    db.select().from(categories).orderBy(asc(categories.sortOrder)),
    db.execute<{ product_id: string; qty: number }>(sql`select oi.product_id, sum(oi.quantity)::float as qty from order_items oi join orders o on o.id = oi.order_id where o.status <> 'CANCELLED' and o.created_at > now() - interval '30 days' group by 1`),
  ]);
  const soldMap = new Map(sold.rows.map((r) => [r.product_id, Number(r.qty)]));
  const manage = can(user.role, "products:manage");
  const base = (s: string) => `/admin/products?${new URLSearchParams(Object.entries({ status: s, category: cat, q }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader title="Products & services" description="Your catalog: live animals, meat, fish, produce, farm goods and services." actions={manage && <ButtonLink href="/admin/products/new"><Plus className="h-4 w-4" aria-hidden /> Add product</ButtonLink>} />
      <Tabs active={status} tabs={[{ key: "ACTIVE", label: "Active", href: base("ACTIVE") }, { key: "DRAFT", label: "Drafts", href: base("DRAFT") }, { key: "ARCHIVED", label: "Archived", href: base("ARCHIVED") }, { key: "ALL", label: "All", href: base("ALL") }]} />
      <form action="/admin/products" className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={q} placeholder="Search name or SKU" className="field h-10 w-full sm:w-64" />
        <select name="category" defaultValue={cat ?? ""} className="field h-10 w-auto">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-surface-2 px-4 text-sm font-semibold">Filter</button>
      </form>
      <Card className="mt-4">
        {rows.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="No products" action={manage && <ButtonLink href="/admin/products/new">Add a product</ButtonLink>} />
        ) : (
          <Table>
            <thead><tr><Th>Product</Th><Th>Category</Th><Th align="right">Price</Th><Th align="right">Stock</Th><Th align="right">Sold (30d)</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map(({ p, catName, icon }) => {
                const low = p.trackInventory && p.stockQty <= p.lowStockThreshold;
                return (
                  <tr key={p.id} className="hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg"><ProductImage src={p.images[0] ? `${p.images[0]}${p.images[0].startsWith("/media/") ? "?thumb=1" : ""}` : null} alt="" icon={icon} size="sm" /></span>
                        <span><span className="font-semibold hover:underline">{p.name}</span><span className="block text-xs text-muted">{p.sku}{p.type === "SERVICE" && " · Service"}{p.featured && " · Featured"}</span></span>
                      </Link>
                    </Td>
                    <Td className="text-muted">{catName ?? "—"}</Td>
                    <Td align="right"><span className="font-semibold">{formatMoney(p.price, cur)}</span><span className="text-xs text-muted">/{UNIT_LABELS[p.unit as SalesUnit].short}</span></Td>
                    <Td align="right">{p.trackInventory ? <span className={low ? "font-semibold text-danger" : ""}>{formatQuantity(p.stockQty, p.unit)}</span> : <span className="text-muted">—</span>}</Td>
                    <Td align="right" className="text-muted">{soldMap.get(p.id) ? formatQuantity(Math.round(soldMap.get(p.id)! * 10) / 10, p.unit) : "—"}</Td>
                    <Td><Badge tone={p.status === "ACTIVE" ? "success" : p.status === "DRAFT" ? "warning" : "neutral"}>{p.status.toLowerCase()}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {manage && (
        <Card className="mt-6">
          <CardHeader title="Categories" description="Shown as shop sections and filters." />
          <CardBody className="space-y-3">
            {cats.map((c) => <CategoryForm key={c.id} c={c} />)}
            <div className="border-t border-border pt-4"><CategoryForm /></div>
          </CardBody>
        </Card>
      )}
    </>
  );
}
