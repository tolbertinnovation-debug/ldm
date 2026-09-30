import { notFound } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { loadInvoice } from "@/lib/services/invoice-view";
import { isOverdue } from "@/lib/services/invoices";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Invoice", robots: { index: false } };

export default async function PublicInvoice(props: PageProps<"/invoice/[token]">) {
  const { token } = await props.params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const data = await loadInvoice({ token });
  if (!data || data.inv.status === "DRAFT") notFound();
  const settings = await getSettings();
  const { inv } = data;
  return (
    <main className="min-h-dvh bg-bg px-3 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end"><PrintButton label="Print / save PDF" /></div>
      <InvoiceDocument
        settings={settings}
        title="Invoice"
        number={inv.number}
        issueDate={inv.issueDate}
        dueDate={inv.dueDate}
        status={isOverdue(inv) ? "Overdue" : inv.status.replace("_", " ")}
        customer={{ name: data.customer.name, phone: data.customer.phone, email: data.customer.email, company: data.customer.companyName, address: data.address }}
        lines={data.items}
        subtotal={inv.subtotal}
        discount={inv.discountTotal}
        tax={inv.taxTotal}
        total={inv.total}
        paid={inv.amountPaid}
        notes={inv.notes}
        terms={inv.terms}
      />
    </main>
  );
}
