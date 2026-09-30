import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, or } from "drizzle-orm";
import { ExternalLink, Printer, Send } from "lucide-react";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { centsToInput, formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { loadInvoice } from "@/lib/services/invoice-view";
import { isOverdue } from "@/lib/services/invoices";
import { INVOICE_STATUS_META, PAYMENT_METHOD_LABELS, PAYMENT_RECORD_STATUS_META } from "@/lib/constants";
import { ButtonLink, Card, CardBody, CardHeader, PageHeader, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { InvoiceDocument } from "@/components/invoice-document";
import { PaymentForm } from "@/components/admin/order-forms";
import { invoiceStatusAction } from "../actions";

export default async function InvoicePage(props: PageProps<"/admin/invoices/[id]">) {
  const user = await requireStaff("invoices:manage");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await loadInvoice({ id });
  if (!data) notFound();
  const { inv } = data;
  const settings = await getSettings();
  const cur = settings.commerce.currency;
  const pays = await db.select().from(payments).where(inv.orderId ? or(eq(payments.invoiceId, id), eq(payments.orderId, inv.orderId)) : eq(payments.invoiceId, id)).orderBy(desc(payments.createdAt));
  const due = Math.max(0, inv.total - inv.amountPaid);
  const status = isOverdue(inv) ? "OVERDUE" : inv.status;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/invoices", label: "Invoices" }}
        title={<span className="flex items-center gap-3">{inv.number}<StatusBadge status={status} meta={INVOICE_STATUS_META} /></span>}
        description={`${data.customer.companyName ?? data.customer.name}${inv.sentAt ? ` · sent ${formatDateTime(inv.sentAt)}` : ""}`}
        actions={
          <>
            {inv.status !== "VOID" && <ActionButton action={invoiceStatusAction} fields={{ id, op: "send" }} variant="primary"><Send className="h-4 w-4" aria-hidden /> {inv.sentAt ? "Resend" : "Send to customer"}</ActionButton>}
            <ButtonLink href={`/print/invoice/${id}`} target="_blank" variant="outline" size="sm"><Printer className="h-4 w-4" aria-hidden /> Print / PDF</ButtonLink>
            {inv.status !== "DRAFT" && <ButtonLink href={`/invoice/${inv.publicToken}`} target="_blank" variant="ghost" size="sm"><ExternalLink className="h-4 w-4" aria-hidden /> Customer link</ButtonLink>}
            {inv.orderId && <Link href={`/admin/orders/${inv.orderId}`} className="link px-2 text-sm">View order</Link>}
            {inv.status === "DRAFT" && <ActionButton action={invoiceStatusAction} fields={{ id, op: "mark-sent" }}>Mark as sent</ActionButton>}
            {inv.status !== "VOID" && inv.amountPaid === 0 && <ActionButton action={invoiceStatusAction} fields={{ id, op: "void" }} variant="ghost" confirm="Void this invoice? This cannot be undone.">Void</ActionButton>}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <InvoiceDocument settings={settings} title="Invoice" number={inv.number} issueDate={inv.issueDate} dueDate={inv.dueDate} status={status.replace("_", " ")} customer={{ name: data.customer.name, phone: data.customer.phone, email: data.customer.email, company: data.customer.companyName, address: data.address }} lines={data.items} subtotal={inv.subtotal} discount={inv.discountTotal} tax={inv.taxTotal} total={inv.total} paid={inv.amountPaid} notes={inv.notes} terms={inv.terms} />
        <div className="space-y-6">
          {can(user.role, "payments:manage") && inv.status !== "VOID" && (
            <Card>
              <CardHeader title={due > 0 ? `Record payment · ${formatMoney(due, cur)} due` : "Paid in full"} />
              <CardBody><PaymentForm invoiceId={id} due={due > 0 ? centsToInput(due) : ""} allowRefund={inv.amountPaid > 0} /></CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Payments" />
            {pays.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No payments yet.</p> : (
              <ul className="divide-y divide-border">
                {pays.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span>{PAYMENT_METHOD_LABELS[p.method]}<span className="block text-xs text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}</span></span>
                    <StatusBadge status={p.status} meta={PAYMENT_RECORD_STATUS_META} />
                    <span className="tabular font-semibold">{p.kind === "REFUND" ? "−" : ""}{formatMoney(p.amount, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
