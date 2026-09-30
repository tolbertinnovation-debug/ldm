import { and, desc, gte, lte } from "drizzle-orm";
import { Download, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate, todayInTz } from "@/lib/format";
import { expensesByCategory, rangeFromPreset } from "@/lib/services/analytics";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { BarList } from "@/components/charts";
import { DeleteExpense, ExpenseForm } from "@/components/admin/expense-form";
import { RangeTabs, sp } from "@/components/admin/bits";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage(props: PageProps<"/admin/expenses">) {
  const user = await requireStaff("expenses:manage");
  const range = rangeFromPreset(sp((await props.searchParams).range) ?? "mtd");
  const cur = (await getSettings()).commerce.currency;
  const [rows, byCat, cats] = await Promise.all([
    db.select({ e: expenses, by: users.name }).from(expenses).leftJoin(users, eq(users.id, expenses.createdById)).where(and(gte(expenses.date, range.from), lte(expenses.date, range.to))).orderBy(desc(expenses.date), desc(expenses.createdAt)).limit(500),
    expensesByCategory(range),
    db.selectDistinct({ c: expenses.category }).from(expenses),
  ]);
  const total = byCat.reduce((a, c) => a + c.amount, 0);
  return (
    <>
      <PageHeader title="Expenses" description="Record farm costs — feed, vet, wages, fuel, electricity — for accurate profit reports." actions={<><RangeTabs active={range.preset} base="/admin/expenses" />{can(user.role, "reports:view") && <ButtonLink href={`/api/admin/export/expenses?from=${range.from}&to=${range.to}`} variant="outline" size="sm"><Download className="h-4 w-4" aria-hidden /> Export</ButtonLink>}</>} />
      <Card className="mb-6">
        <CardHeader title="Add expense" />
        <CardBody><ExpenseForm today={todayInTz()} categories={cats.map((c) => c.c)} /></CardBody>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title={`${range.label}: ${formatMoney(total, cur)}`} description={`${rows.length} expenses`} />
          {rows.length === 0 ? <EmptyState icon={<Receipt className="h-6 w-6" />} title="No expenses in this period" /> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th>Paid by</Th><Th align="right">Amount</Th><Th /></tr></thead>
              <tbody>
                {rows.map(({ e, by }) => (
                  <tr key={e.id}>
                    <Td className="whitespace-nowrap text-muted">{formatDate(e.date, { day: "numeric", month: "short" })}</Td>
                    <Td className="font-medium">{e.category}</Td>
                    <Td>{e.description}<p className="text-xs text-muted">{[e.vendor, e.reference, by].filter(Boolean).join(" · ")}</p></Td>
                    <Td className="text-muted">{PAYMENT_METHOD_LABELS[e.paymentMethod]}</Td>
                    <Td align="right" className="font-semibold">{formatMoney(e.amount, cur)}</Td>
                    <Td><DeleteExpense id={e.id} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader title="By category" />
          <CardBody><BarList items={byCat.map((c) => ({ label: c.name, value: c.amount, hint: `${c.count} entries` }))} currency={cur} colorIndex={1} /></CardBody>
        </Card>
      </div>
    </>
  );
}
