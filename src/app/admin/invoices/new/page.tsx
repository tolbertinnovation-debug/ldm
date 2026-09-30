import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, products } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { centsToInput } from "@/lib/money";
import { addDays, todayIso } from "@/lib/services/invoices";
import { unitLabel } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { InvoiceEditor } from "@/components/admin/invoice-editor";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  await requireStaff("invoices:manage");
  const settings = await getSettings();
  const [custs, prods] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, company: customers.companyName, phone: customers.phone }).from(customers).orderBy(asc(customers.name)).limit(3000),
    db.select({ name: products.name, price: products.price, unit: products.unit }).from(products).where(eq(products.status, "ACTIVE")),
  ]);
  const today = todayIso();
  return (
    <>
      <PageHeader back={{ href: "/admin/invoices", label: "Invoices" }} title="New invoice" />
      <InvoiceEditor
        currency={settings.commerce.currency}
        customers={custs.map((c) => ({ value: c.id, label: `${c.company ?? c.name}${c.phone ? ` · ${c.phone}` : ""}` }))}
        products={prods.map((p) => ({ name: p.name, price: centsToInput(p.price), unit: unitLabel(p.unit) }))}
        defaults={{ issueDate: today, dueDate: addDays(today, settings.invoice.dueDays), notes: settings.invoice.notes, terms: settings.invoice.terms }}
      />
    </>
  );
}
