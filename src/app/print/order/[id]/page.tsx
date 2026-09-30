import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderItems, orders } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { unitLabel } from "@/lib/constants";

export const metadata = { title: "Receipt", robots: { index: false } };

export default async function OrderReceipt(props: PageProps<"/print/order/[id]">) {
  await requireStaff("orders:view");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) notFound();
  const [items, [customer], settings] = await Promise.all([db.select().from(orderItems).where(eq(orderItems.orderId, id)), db.select().from(customers).where(eq(customers.id, order.customerId)), getSettings()]);
  const lines = items.map((i) => ({ description: i.options.length ? `${i.name} (${i.options.map((o) => o.choice).join(", ")})` : i.name, quantity: i.quantity, unit: unitLabel(i.unit, i.quantity), unitPrice: i.unitPrice, lineTotal: i.lineTotal }));
  if (order.deliveryFee > 0) lines.push({ description: "Delivery", quantity: 1, unit: "trip", unitPrice: order.deliveryFee, lineTotal: order.deliveryFee });
  return (
    <main className="min-h-dvh bg-bg px-3 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end"><PrintButton label="Print receipt" /></div>
      <InvoiceDocument
        settings={settings}
        title={order.paymentStatus === "PAID" ? "Receipt" : "Order"}
        number={order.number}
        issueDate={order.createdAt}
        status={order.paymentStatus.replace("_", " ")}
        customer={{ name: order.contactName, phone: order.contactPhone, email: order.contactEmail, company: customer?.companyName, address: order.deliveryAddress ? [order.deliveryAddress.line1, order.deliveryAddress.area, order.deliveryAddress.city].filter(Boolean).join(", ") : null }}
        lines={lines}
        subtotal={order.subtotal + order.deliveryFee}
        discount={order.discountTotal}
        tax={order.taxTotal}
        total={order.total}
        paid={order.amountPaid}
        notes={settings.invoice.notes}
      />
    </main>
  );
}
