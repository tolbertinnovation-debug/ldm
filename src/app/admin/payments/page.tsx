import Link from "next/link";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { Download, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { customers, invoices, orders, payments, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { paymentsByMethod, rangeFromPreset } from "@/lib/services/analytics";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, PAYMENT_RECORD_STATUS_META } from "@/lib/constants";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Pagination, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui";
import { BarList } from "@/components/charts";
import { SettleButtons } from "@/components/admin/order-forms";
import { pageNum, RangeTabs, sp } from "@/components/admin/bits";

export const metadata = { title: "Payments" };
const PAGE = 30;

export default async function PaymentsPage(props: PageProps<"/admin/payments">) {
  const user = await requireStaff("payments:view");
  const params = await props.searchParams;
  const status = sp(params.status) ?? "ALL";
  const method = sp(params.method);
  const range = rangeFromPreset(sp(params.range) ?? "30d");
  const page = pageNum(params.page);
  const cur = (await getSettings()).commerce.currency;
  const conds: SQL[] = [];
  if (status !== "ALL") conds.push(eq(payments.status, status as "PENDING"));
  if (status !== "PENDING") conds.push(gte(payments.createdAt, new Date(`${range.from}T00:00:00Z`)), lte(payments.createdAt, new Date(`${range.to}T23:59:59Z`)));
  if (method && (PAYMENT_METHODS as readonly string[]).includes(method)) conds.push(eq(payments.method, method as "CASH"));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }], byMethod, [pending]] = await Promise.all([
    db.select({ p: payments, orderNumber: orders.number, invoiceNumber: invoices.number, customer: customers.name, by: users.name }).from(payments).leftJoin(orders, eq(orders.id, payments.orderId)).leftJoin(invoices, eq(invoices.id, payments.invoiceId)).leftJoin(customers, eq(customers.id, payments.customerId)).leftJoin(users, eq(users.id, payments.receivedById)).where(where).orderBy(desc(payments.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(payments).where(where),
    paymentsByMethod(range),
    db.select({ n: sql<number>`count(*)::int`, amt: sql<number>`coalesce(sum(${payments.amount}),0)::int` }).from(payments).where(eq(payments.status, "PENDING")),
  ]);
  const qs = (extra: Record<string, string | undefined>) => `/admin/payments?${new URLSearchParams(Object.entries({ status, method, range: range.preset, ...extra }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <PageHeader title="Payments" description="Cash, Orange Money, MTN MoMo, bank and card payments — verify transfers and reconcile." actions={<><RangeTabs active={range.preset} base="/admin/payments" extra={{ status, method }} />{can(user.role, "reports:view") && <ButtonLink href={`/api/admin/export/payments?from=${range.from}&to=${range.to}`} variant="outline" size="sm"><Download className="h-4 w-4" aria-hidden /> Export</ButtonLink>}</>} />
      {pending!.n > 0 && (
        <Link href={qs({ status: "PENDING" })} className="mb-4 flex items-center justify-between rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning-fg">
          <span><strong>{pending!.n}</strong> mobile money / transfer payments ({formatMoney(pending!.amt, cur)}) are waiting for you to check against your Orange Money / MoMo statement.</span>
          <span className="font-semibold">Review →</span>
        </Link>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div>
          <Tabs active={status} tabs={[{ key: "ALL", label: "All", href: qs({ status: "ALL" }) }, { key: "PENDING", label: "To verify", href: qs({ status: "PENDING" }), count: pending!.n }, { key: "SUCCEEDED", label: "Received", href: qs({ status: "SUCCEEDED" }) }, { key: "FAILED", label: "Failed", href: qs({ status: "FAILED" }) }]} />
          <Card className="mt-4">
            {rows.length === 0 ? <EmptyState icon={<Wallet className="h-6 w-6" />} title="No payments" /> : (
              <Table>
                <thead><tr><Th>Payment</Th><Th>For</Th><Th>Method</Th><Th>Status</Th><Th align="right">Amount</Th></tr></thead>
                <tbody>
                  {rows.map(({ p, orderNumber, invoiceNumber, customer, by }) => (
                    <tr key={p.id}>
                      <Td><p className="font-medium">{p.reference}</p><p className="text-xs text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}{by && ` · ${by}`}</p></Td>
                      <Td>
                        {p.orderId ? <Link href={`/admin/orders/${p.orderId}`} className="link">{orderNumber}</Link> : p.invoiceId ? <Link href={`/admin/invoices/${p.invoiceId}`} className="link">{invoiceNumber}</Link> : "—"}
                        <p className="text-xs text-muted">{customer}</p>
                      </Td>
                      <Td>{PAYMENT_METHOD_LABELS[p.method]}<p className="text-xs text-muted">{[p.providerRef && `ref ${p.providerRef}`, p.payerPhone && formatPhone(p.payerPhone), p.provider !== "manual" && p.provider].filter(Boolean).join(" · ")}</p></Td>
                      <Td>
                        <StatusBadge status={p.status} meta={PAYMENT_RECORD_STATUS_META} />
                        {p.status === "PENDING" && can(user.role, "payments:manage") && <div className="mt-2"><SettleButtons paymentId={p.id} /></div>}
                      </Td>
                      <Td align="right" className={p.kind === "REFUND" ? "font-semibold text-danger-fg" : "font-semibold"}>{p.kind === "REFUND" ? "−" : ""}{formatMoney(p.amount, cur)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination page={page} pageCount={Math.ceil(total / PAGE)} hrefFor={(n) => qs({ page: String(n) })} />
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Collected by method" description={range.label} />
          <CardBody><BarList items={byMethod.map((m) => ({ label: PAYMENT_METHOD_LABELS[m.key as keyof typeof PAYMENT_METHOD_LABELS] ?? m.key, value: m.amount, hint: `${m.count} payments` }))} currency={cur} /></CardBody>
        </Card>
      </div>
    </>
  );
}
