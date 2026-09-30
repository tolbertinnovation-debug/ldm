import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { customers, invoices } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { isOverdue } from "@/lib/services/invoices";
import { receivablesAging } from "@/lib/services/analytics";
import { INVOICE_STATUS_META } from "@/lib/constants";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui";
import { BarList } from "@/components/charts";
import { sp } from "@/components/admin/bits";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage(props: PageProps<"/admin/invoices">) {
  await requireStaff("invoices:manage");
  const status = sp((await props.searchParams).status) ?? "open";
  const cur = (await getSettings()).commerce.currency;
  const conds: SQL[] = [];
  if (status === "open") conds.push(sql`${invoices.status} in ('DRAFT','SENT','PARTIALLY_PAID')`);
  else if (status === "overdue") conds.push(sql`${invoices.status} in ('SENT','PARTIALLY_PAID') and ${invoices.dueDate} < current_date`);
  else if (status !== "all") conds.push(eq(invoices.status, status as "PAID"));
  const [rows, aging, [sum]] = await Promise.all([
    db.select({ i: invoices, customer: customers.name }).from(invoices).innerJoin(customers, eq(customers.id, invoices.customerId)).where(conds.length ? and(...conds) : undefined).orderBy(desc(invoices.createdAt)).limit(200),
    receivablesAging(),
    db.select({ outstanding: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}) filter (where ${invoices.status} in ('SENT','PARTIALLY_PAID')),0)::int`, overdue: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}) filter (where ${invoices.status} in ('SENT','PARTIALLY_PAID') and ${invoices.dueDate} < current_date),0)::int` }).from(invoices),
  ]);
  return (
    <>
      <PageHeader title="Invoices" description="Bill wholesale customers, restaurants and training clients — track what's owed." actions={<ButtonLink href="/admin/invoices/new"><Plus className="h-4 w-4" aria-hidden /> New invoice</ButtonLink>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div>
          <Tabs active={status} tabs={[{ key: "open", label: "Open", href: "/admin/invoices" }, { key: "overdue", label: "Overdue", href: "/admin/invoices?status=overdue" }, { key: "PAID", label: "Paid", href: "/admin/invoices?status=PAID" }, { key: "VOID", label: "Void", href: "/admin/invoices?status=VOID" }, { key: "all", label: "All", href: "/admin/invoices?status=all" }]} />
          <Card className="mt-4">
            {rows.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="No invoices" /> : (
              <Table>
                <thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Due</Th><Th>Status</Th><Th align="right">Total</Th><Th align="right">Balance</Th></tr></thead>
                <tbody>
                  {rows.map(({ i, customer }) => (
                    <tr key={i.id} className="hover:bg-surface-2/50">
                      <Td><Link href={`/admin/invoices/${i.id}`} className="font-semibold hover:underline">{i.number}</Link><p className="text-xs text-muted">{formatDate(i.issueDate)}</p></Td>
                      <Td>{customer}</Td>
                      <Td className={isOverdue(i) ? "font-semibold text-danger" : "text-muted"}>{formatDate(i.dueDate)}</Td>
                      <Td><StatusBadge status={isOverdue(i) ? "OVERDUE" : i.status} meta={INVOICE_STATUS_META} /></Td>
                      <Td align="right">{formatMoney(i.total, cur)}</Td>
                      <Td align="right" className="font-semibold">{formatMoney(Math.max(0, i.total - i.amountPaid), cur)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-5"><p className="text-sm text-muted">Outstanding on invoices</p><p className="tabular text-2xl font-bold">{formatMoney(sum!.outstanding, cur)}</p><p className="mt-1 text-sm text-danger">{formatMoney(sum!.overdue, cur)} overdue</p></Card>
          <Card>
            <CardHeader title="All receivables by age" description={`${formatMoney(aging.total, cur)} owed by ${aging.customers} customers (orders + invoices)`} />
            <CardBody><BarList items={aging.buckets.map((b) => ({ label: b.label, value: b.amount }))} currency={cur} colorIndex={1} /></CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
