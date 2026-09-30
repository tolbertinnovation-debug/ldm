import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { categories, products, stockMovements, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { centsToInput } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { formatQuantity, STOCK_MOVEMENT_LABELS } from "@/lib/constants";
import { ButtonLink, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { ProductForm } from "@/components/admin/product-form";
import { StockForm } from "@/components/admin/stock-form";

export default async function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  const user = await requireStaff("products:view");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) notFound();
  const [cats, settings, moves] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
    getSettings(),
    db.select({ m: stockMovements, by: users.name }).from(stockMovements).leftJoin(users, eq(users.id, stockMovements.createdById)).where(eq(stockMovements.productId, id)).orderBy(desc(stockMovements.createdAt)).limit(30),
  ]);
  return (
    <>
      <PageHeader back={{ href: "/admin/products", label: "Products" }} title={p.name} description={p.trackInventory ? `In stock: ${formatQuantity(p.stockQty, p.unit)}` : undefined} actions={<ButtonLink href={p.type === "SERVICE" ? `/services/${p.slug}` : `/product/${p.slug}`} target="_blank" variant="outline" size="sm"><ExternalLink className="h-4 w-4" aria-hidden /> View in shop</ButtonLink>} />
      {p.trackInventory && can(user.role, "inventory:manage") && (
        <Card className="mb-6">
          <CardHeader title="Stock" description={`Current: ${formatQuantity(p.stockQty, p.unit)} · alert at ${p.lowStockThreshold}`} />
          <CardBody><StockForm productId={p.id} unit={p.unit.toLowerCase()} compact /></CardBody>
        </Card>
      )}
      {can(user.role, "products:manage") ? (
        <ProductForm
          currency={settings.commerce.currency}
          categories={cats.map((c) => ({ value: c.id, label: c.name }))}
          v={{
            id: p.id, type: p.type, name: p.name, slug: p.slug, sku: p.sku ?? "", categoryId: p.categoryId ?? "", shortDescription: p.shortDescription ?? "", description: p.description ?? "", unit: p.unit,
            price: centsToInput(p.price), compareAtPrice: centsToInput(p.compareAtPrice), costPrice: centsToInput(p.costPrice), pricingNote: p.pricingNote ?? "", variableWeight: p.variableWeight,
            minQty: p.minQty, qtyStep: p.qtyStep, maxQty: p.maxQty?.toString() ?? "", trackInventory: p.trackInventory, lowStockThreshold: p.lowStockThreshold, allowBackorder: p.allowBackorder,
            availability: p.availability, leadTimeDays: p.leadTimeDays, allowDelivery: p.allowDelivery, allowPickup: p.allowPickup, taxable: p.taxable, status: p.status, featured: p.featured,
            tags: p.tags.join(", "), attributes: Object.entries(p.attributes).map(([k, v]) => `${k}: ${v}`).join("\n"), options: p.options, images: p.images,
          }}
        />
      ) : (
        <Card><CardBody>You can view this product but not edit it.</CardBody></Card>
      )}
      {moves.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Stock history" />
          <Table>
            <thead><tr><Th>When</Th><Th>Type</Th><Th align="right">Change</Th><Th align="right">Balance</Th><Th>Reference</Th><Th>By</Th></tr></thead>
            <tbody>
              {moves.map(({ m, by }) => (
                <tr key={m.id}>
                  <Td className="text-muted">{formatDateTime(m.createdAt)}</Td>
                  <Td>{STOCK_MOVEMENT_LABELS[m.type]}</Td>
                  <Td align="right" className={m.quantity < 0 ? "text-danger-fg" : "text-success-fg"}>{m.quantity > 0 ? "+" : ""}{m.quantity}</Td>
                  <Td align="right" className="font-semibold">{m.balanceAfter}</Td>
                  <Td className="text-muted">{[m.reference, m.note].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td className="text-muted">{by ?? "System"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
