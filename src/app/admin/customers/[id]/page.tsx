import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, customerAddresses, customers, invoices, messages, orders } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { customerBalance } from "@/lib/services/customers";
import { BOOKING_STATUS_META, CUSTOMER_TYPE_LABELS, INVOICE_STATUS_META, MESSAGE_CHANNEL_LABELS, ORDER_STATUS_META, PAYMENT_STATUS_META } from "@/lib/constants";
import { Avatar, Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge, cn } from "@/components/ui";
import { CustomerForm } from "@/components/admin/customer-form";
import { MessageForm } from "@/components/admin/order-forms";
import { StatTile } from "@/components/admin/bits";
import { SocialIcon } from "@/components/shop/visuals";

export default async function CustomerPage(props: PageProps<"/admin/customers/[id]">) {
  const user = await requireStaff("customers:view");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) notFound();
  const cur = (await getSettings()).commerce.currency;
  const [ords, invs, msgs, addrs, books, balance] = await Promise.all([
    db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt)).limit(50),
    db.select().from(invoices).where(eq(invoices.customerId, id)).orderBy(desc(invoices.createdAt)).limit(20),
    can(user.role, "messages:view") ? db.select().from(messages).where(eq(messages.customerId, id)).orderBy(desc(messages.createdAt)).limit(40) : Promise.resolve([]),
    db.select().from(customerAddresses).where(eq(customerAddresses.customerId, id)),
    db.select().from(bookings).where(eq(bookings.customerId, id)).orderBy(desc(bookings.createdAt)).limit(10),
    customerBalance(id),
  ]);
  if (msgs.some((m) => m.direction === "INBOUND" && !m.readAt)) {
    await db.update(messages).set({ readAt: new Date() }).where(and(eq(messages.customerId, id), eq(messages.direction, "INBOUND")));
  }
  const aov = c.ordersCount ? Math.round(c.totalSpent / c.ordersCount) : 0;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/customers", label: "Customers" }}
        title={<span className="flex items-center gap-3"><Avatar name={c.name} className="h-11 w-11 text-sm" />{c.name}</span>}
        description={`${CUSTOMER_TYPE_LABELS[c.type]}${c.source ? ` · via ${c.source}` : ""} · customer since ${formatDate(c.createdAt)}`}
        actions={
          <>
            {c.phone && <a href={`tel:${c.phone}`} className="inline-flex h-8 items-center rounded-xl border border-border-strong bg-surface px-3 text-[13px] font-semibold">Call {formatPhone(c.phone)}</a>}
            {c.phone && <a href={whatsappLink(c.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-[13px] font-semibold text-white"><SocialIcon name="whatsapp" className="h-4 w-4" /> WhatsApp</a>}
            {can(user.role, "pos:use") && <ButtonLink href="/admin/pos" size="sm">New order</ButtonLink>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Orders" value={String(c.ordersCount)} />
        <StatTile label="Lifetime spend" value={formatMoney(c.totalSpent, cur)} />
        <StatTile label="Avg. order" value={formatMoney(aov, cur)} />
        <StatTile label="Balance owed" value={formatMoney(balance, cur)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Orders" />
            {ords.length === 0 ? <EmptyState title="No orders yet" /> : (
              <ul className="divide-y divide-border">
                {ords.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline">{o.number}<span className="block text-xs font-normal text-muted">{formatDate(o.createdAt)} · {o.fulfillmentType.toLowerCase()}</span></Link>
                    <span className="flex items-center gap-2"><StatusBadge status={o.status} meta={ORDER_STATUS_META} /><Badge tone={PAYMENT_STATUS_META[o.paymentStatus].tone}>{PAYMENT_STATUS_META[o.paymentStatus].label}</Badge></span>
                    <span className="tabular w-24 text-right font-semibold">{formatMoney(o.total, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(invs.length > 0 || books.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {invs.length > 0 && (
                <Card>
                  <CardHeader title="Invoices" />
                  <ul className="divide-y divide-border">
                    {invs.map((i) => (
                      <li key={i.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <Link href={`/admin/invoices/${i.id}`} className="font-medium hover:underline">{i.number}</Link>
                        <StatusBadge status={i.status} meta={INVOICE_STATUS_META} />
                        <span className="tabular">{formatMoney(i.total, cur)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {books.length > 0 && (
                <Card>
                  <CardHeader title="Bookings" />
                  <ul className="divide-y divide-border">
                    {books.map((b) => (
                      <li key={b.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <span>{b.serviceName}<span className="block text-xs text-muted">{b.number}</span></span>
                        <StatusBadge status={b.status} meta={BOOKING_STATUS_META} />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <CustomerForm readOnly={!can(user.role, "customers:manage")} v={{ id: c.id, name: c.name, phone: c.phone ?? "", email: c.email ?? "", type: c.type, companyName: c.companyName ?? "", tags: c.tags.join(", "), notes: c.notes ?? "", source: c.source ?? "", preferredChannel: c.preferredChannel ?? "WHATSAPP", discountPercent: c.discountPercent, marketingWhatsapp: c.marketingWhatsapp, marketingSms: c.marketingSms, marketingEmail: c.marketingEmail }} />
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          {can(user.role, "messages:view") && (
            <Card>
              <CardHeader title="Conversation" />
              <CardBody className="space-y-4">
                {can(user.role, "messages:send") && <MessageForm customerId={c.id} phone={c.phone} email={c.email} />}
                <ol className="flex max-h-[520px] flex-col-reverse gap-2 overflow-y-auto">
                  {msgs.map((m) => (
                    <li key={m.id} className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", m.direction === "INBOUND" ? "self-start rounded-bl-md bg-surface-2" : "self-end rounded-br-md bg-primary-soft text-primary-soft-fg")}>
                      <p className="whitespace-pre-line">{m.body}</p>
                      <p className="mt-1 text-[11px] opacity-70">{MESSAGE_CHANNEL_LABELS[m.channel]} · {formatDateTime(m.createdAt)}{m.direction === "OUTBOUND" && ` · ${m.status.toLowerCase()}`}</p>
                    </li>
                  ))}
                  {msgs.length === 0 && <li className="py-4 text-center text-sm text-muted">No messages yet.</li>}
                </ol>
              </CardBody>
            </Card>
          )}
          {addrs.length > 0 && (
            <Card>
              <CardHeader title="Addresses" />
              <ul className="divide-y divide-border text-sm">
                {addrs.map((a) => <li key={a.id} className="px-5 py-2.5">{[a.line1, a.area, a.landmark && `near ${a.landmark}`].filter(Boolean).join(", ")}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
