import Link from "next/link";
import { and, arrayContains, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { Download, Plus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES } from "@/lib/constants";
import { Avatar, Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Pagination, Table, Tabs, Td, Th } from "@/components/ui";
import { CustomerForm } from "@/components/admin/customer-form";
import { pageNum, sp, StatTile } from "@/components/admin/bits";

export const metadata = { title: "Customers" };
const PAGE = 30;

const SEGMENTS: Record<string, { label: string; where: () => SQL }> = {
  all: { label: "All", where: () => sql`true` },
  top: { label: "Top spenders", where: () => gte(customers.totalSpent, 20000) },
  repeat: { label: "Repeat buyers", where: () => gte(customers.ordersCount, 3) },
  new: { label: "New (30 days)", where: () => gte(customers.createdAt, sql`now() - interval '30 days'`) },
  lapsed: { label: "Lapsed (60+ days)", where: () => and(lt(customers.lastOrderAt, sql`now() - interval '60 days'`))! },
  never: { label: "Never ordered", where: () => isNull(customers.lastOrderAt) },
  business: { label: "Businesses", where: () => sql`${customers.type} <> 'INDIVIDUAL'` },
  optin: { label: "Opted in", where: () => or(eq(customers.marketingWhatsapp, true), eq(customers.marketingSms, true), eq(customers.marketingEmail, true))! },
};

export default async function CustomersPage(props: PageProps<"/admin/customers">) {
  const user = await requireStaff("customers:view");
  const params = await props.searchParams;
  const seg = SEGMENTS[sp(params.segment) ?? "all"] ? (sp(params.segment) ?? "all") : "all";
  const q = sp(params.q)?.trim();
  const type = sp(params.type);
  const tag = sp(params.tag);
  const page = pageNum(params.page);
  const cur = (await getSettings()).commerce.currency;
  const conds: SQL[] = [SEGMENTS[seg]!.where()];
  if (q) {
    const digits = q.replace(/\D/g, "");
    conds.push(or(ilike(customers.name, `%${q}%`), ilike(customers.email, `%${q}%`), ilike(customers.companyName, `%${q}%`), ...(digits.length >= 3 ? [ilike(customers.phone, `%${digits}%`)] : []))!);
  }
  if (type && (CUSTOMER_TYPES as readonly string[]).includes(type)) conds.push(eq(customers.type, type as "INDIVIDUAL"));
  if (tag) conds.push(arrayContains(customers.tags, [tag]));
  const where = and(...conds);
  const [rows, [{ total }], [stats]] = await Promise.all([
    db.select().from(customers).where(where).orderBy(desc(sql`coalesce(${customers.lastOrderAt}, ${customers.createdAt})`)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where),
    db.select({
      all: sql<number>`count(*)::int`,
      buyers: sql<number>`count(*) filter (where ${customers.ordersCount} > 0)::int`,
      repeat: sql<number>`count(*) filter (where ${customers.ordersCount} > 1)::int`,
      ltv: sql<number>`coalesce(avg(${customers.totalSpent}) filter (where ${customers.ordersCount} > 0), 0)::int`,
    }).from(customers),
  ]);
  const qs = (extra: Record<string, string | undefined>) => `/admin/customers?${new URLSearchParams(Object.entries({ segment: seg, q, type, tag, ...extra }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader title="Customers" description="Your customer database: contacts, order history, segments and consent." actions={can(user.role, "reports:view") && <ButtonLink href="/api/admin/export/customers" variant="outline" size="sm"><Download className="h-4 w-4" aria-hidden /> Export</ButtonLink>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Customers" value={stats!.all.toLocaleString()} />
        <StatTile label="Have ordered" value={stats!.buyers.toLocaleString()} />
        <StatTile label="Repeat rate" value={stats!.buyers ? `${Math.round((stats!.repeat / stats!.buyers) * 100)}%` : "—"} />
        <StatTile label="Avg. lifetime value" value={formatMoney(stats!.ltv, cur)} />
      </div>
      <Tabs active={seg} tabs={Object.entries(SEGMENTS).map(([k, v]) => ({ key: k, label: v.label, href: qs({ segment: k, page: undefined }) }))} />
      <form action="/admin/customers" className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="segment" value={seg} />
        <input name="q" defaultValue={q} placeholder="Name, phone, email, business" className="field h-10 w-full sm:w-72" />
        <select name="type" defaultValue={type ?? ""} className="field h-10 w-auto">
          <option value="">All types</option>
          {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</option>)}
        </select>
        <input name="tag" defaultValue={tag} placeholder="Tag" className="field h-10 w-28" />
        <button className="h-10 rounded-xl bg-surface-2 px-4 text-sm font-semibold">Filter</button>
      </form>
      <Card className="mt-4">
        {rows.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No customers in this view" />
        ) : (
          <Table>
            <thead><tr><Th>Customer</Th><Th>Type</Th><Th align="right">Orders</Th><Th align="right">Spent</Th><Th>Last order</Th><Th>Consent</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/50">
                  <Td>
                    <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <span><span className="font-semibold hover:underline">{c.name}</span><span className="block text-xs text-muted">{c.phone ? formatPhone(c.phone) : c.email}</span></span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-muted">{CUSTOMER_TYPE_LABELS[c.type]}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}{c.discountPercent > 0 && <Badge tone="accent">{c.discountPercent}% off</Badge>}</span>
                  </Td>
                  <Td align="right">{c.ordersCount}</Td>
                  <Td align="right" className="font-semibold">{formatMoney(c.totalSpent, cur)}</Td>
                  <Td className="text-muted" >{c.lastOrderAt ? <span title={formatDate(c.lastOrderAt)}>{timeAgo(c.lastOrderAt)}</span> : "Never"}</Td>
                  <Td className="text-xs text-muted">{[c.marketingWhatsapp && "WA", c.marketingSms && "SMS", c.marketingEmail && "Email"].filter(Boolean).join(" · ") || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} hrefFor={(p) => qs({ page: String(p) })} />
      </Card>
      {can(user.role, "customers:manage") && (
        <Card className="mt-6">
          <CardHeader title={<span className="flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden /> Add customer</span>} />
          <CardBody>
            <CustomerForm v={{ name: "", phone: "", email: "", type: "INDIVIDUAL", companyName: "", tags: "", notes: "", source: "", preferredChannel: "WHATSAPP", discountPercent: 0, marketingWhatsapp: false, marketingSms: false, marketingEmail: false }} />
          </CardBody>
        </Card>
      )}
    </>
  );
}
