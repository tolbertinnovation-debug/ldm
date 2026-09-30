import { asc, desc, eq } from "drizzle-orm";
import { Tag } from "lucide-react";
import { db } from "@/lib/db";
import { campaigns, categories, products, promotions } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { PromotionForm } from "@/components/admin/marketing-forms";
import { ActionButton } from "@/components/form";
import { togglePromotionAction } from "./toggle";

export const metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  await requireStaff("marketing:manage");
  const cur = (await getSettings()).commerce.currency;
  const [rows, cats, prods, camps] = await Promise.all([
    db.select({ p: promotions, campaign: campaigns.name }).from(promotions).leftJoin(campaigns, eq(campaigns.id, promotions.campaignId)).orderBy(desc(promotions.active), desc(promotions.createdAt)),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
    db.select({ id: products.id, name: products.name }).from(products).where(eq(products.status, "ACTIVE")).orderBy(asc(products.name)),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns),
  ]);
  const now = new Date();
  return (
    <>
      <PageHeader title="Promotions & promo codes" description="Discount codes for customers, radio listeners, restaurants and first-time buyers." />
      <Card>
        {rows.length === 0 ? <EmptyState icon={<Tag className="h-6 w-6" />} title="No promotions yet" /> : (
          <Table>
            <thead><tr><Th>Code</Th><Th>Offer</Th><Th>Valid</Th><Th align="right">Used</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {rows.map(({ p, campaign }) => {
                const expired = p.endsAt && p.endsAt < now;
                return (
                  <tr key={p.id}>
                    <Td><span className="rounded-md bg-accent-soft px-2 py-1 font-mono text-sm font-bold text-accent-soft-fg">{p.code}</span><p className="mt-1 text-xs text-muted">{p.name}{campaign && ` · ${campaign}`}</p></Td>
                    <Td>{p.type === "PERCENT" ? `${p.value}% off` : p.type === "FIXED" ? `${formatMoney(p.value, cur)} off` : "Free delivery"}{p.minSubtotal > 0 && <span className="text-muted"> over {formatMoney(p.minSubtotal, cur)}</span>}<p className="text-xs text-muted">{p.scope === "ALL" ? "Whole order" : `${p.targetIds.length} ${p.scope.toLowerCase()}`}{p.firstOrderOnly && " · first order"}{p.perCustomerLimit && ` · ${p.perCustomerLimit}× per customer`}</p></Td>
                    <Td className="text-muted">{p.startsAt ? formatDate(p.startsAt) : "Now"} → {p.endsAt ? formatDate(p.endsAt) : "no end"}</Td>
                    <Td align="right">{p.usageCount}{p.usageLimit && <span className="text-muted"> / {p.usageLimit}</span>}</Td>
                    <Td>{expired ? <Badge>Expired</Badge> : p.active ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Paused</Badge>}</Td>
                    <Td><ActionButton action={togglePromotionAction} fields={{ id: p.id }} variant="ghost">{p.active ? "Pause" : "Activate"}</ActionButton></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="New promotion" />
        <CardBody><PromotionForm categories={cats.map((c) => ({ value: c.id, label: c.name }))} products={prods.map((p) => ({ value: p.id, label: p.name }))} campaigns={camps.map((c) => ({ value: c.id, label: c.name }))} /></CardBody>
      </Card>
    </>
  );
}
