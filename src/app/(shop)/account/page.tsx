import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { LogOut, MapPin, Package } from "lucide-react";
import { db } from "@/lib/db";
import { bookings, customerAddresses, customers, deliveryZones, orders, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { BOOKING_STATUS_META, ORDER_STATUS_META, PAYMENT_STATUS_META } from "@/lib/constants";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, StatusBadge } from "@/components/ui";
import { AddressForm, DeleteAddress, PasswordForm, ProfileForm, ReorderButton } from "@/components/shop/account-forms";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const settings = await getSettings();
  const cur = settings.commerce.currency;
  const [customer] = await db.select().from(customers).where(eq(customers.userId, user.id)).limit(1);
  const [pw] = await db.select({ has: users.passwordHash }).from(users).where(eq(users.id, user.id));
  const [myOrders, addresses, zones, myBookings] = await Promise.all([
    customer ? db.select().from(orders).where(eq(orders.customerId, customer.id)).orderBy(desc(orders.createdAt)).limit(50) : Promise.resolve([]),
    customer ? db.select().from(customerAddresses).where(eq(customerAddresses.customerId, customer.id)).orderBy(desc(customerAddresses.isDefault)) : Promise.resolve([]),
    db.select({ id: deliveryZones.id, name: deliveryZones.name }).from(deliveryZones).where(eq(deliveryZones.active, true)).orderBy(asc(deliveryZones.sortOrder)),
    customer ? db.select().from(bookings).where(eq(bookings.customerId, customer.id)).orderBy(desc(bookings.createdAt)).limit(10) : Promise.resolve([]),
  ]);
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const openOrders = myOrders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hello, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted">{user.phone ? formatPhone(user.phone) : user.email}</p>
        </div>
        <div className="flex gap-2">
          {isStaffRole(user.role) && <ButtonLink href="/admin" variant="outline">Dashboard</ButtonLink>}
          <form action={logoutAction}>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"><LogOut className="h-4 w-4" aria-hidden /> Sign out</button>
          </form>
        </div>
      </div>

      {customer && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Orders", value: customer.ordersCount },
            { label: "Open now", value: openOrders.length },
            { label: "Total spent", value: formatMoney(customer.totalSpent, cur) },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-muted">{s.label}</p>
              <p className="tabular mt-1 text-xl font-bold">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="My orders" description="Tap an order to track it." />
        {myOrders.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="No orders yet" action={<ButtonLink href="/shop">Start shopping</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-border">
            {myOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <Link href={`/track/${o.trackingToken}`} className="min-w-0 flex-1">
                  <p className="font-semibold">{o.number}</p>
                  <p className="text-sm text-muted">{formatDate(o.createdAt)} · {o.fulfillmentType === "DELIVERY" ? "Delivery" : "Pickup"}</p>
                </Link>
                <div className="flex items-center gap-2">
                  <StatusBadge status={o.status} meta={ORDER_STATUS_META} />
                  <Badge tone={PAYMENT_STATUS_META[o.paymentStatus].tone}>{PAYMENT_STATUS_META[o.paymentStatus].label}</Badge>
                </div>
                <p className="tabular w-24 text-right font-semibold">{formatMoney(o.total, cur)}</p>
                <ReorderButton orderId={o.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {myBookings.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Service bookings" />
          <ul className="divide-y divide-border">
            {myBookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span><span className="font-semibold">{b.serviceName}</span><span className="block text-muted">{b.number} · {b.preferredDate ? formatDate(b.preferredDate) : "Date to be confirmed"}</span></span>
                <StatusBadge status={b.status} meta={BOOKING_STATUS_META} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile & notifications" />
          <CardBody>
            <ProfileForm d={{ name: user.name, email: user.email ?? "", preferredChannel: customer?.preferredChannel ?? "WHATSAPP", marketingWhatsapp: customer?.marketingWhatsapp ?? false, marketingSms: customer?.marketingSms ?? false, marketingEmail: customer?.marketingEmail ?? false }} />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Delivery addresses" />
            <CardBody className="space-y-4">
              {addresses.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl bg-surface-2 p-3 text-sm">
                  <span className="flex gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="font-semibold">{a.label ?? "Address"}</span> {a.isDefault && <Badge tone="brand">Default</Badge>}
                      <span className="block text-muted">{[a.line1, a.area, a.landmark && `near ${a.landmark}`, a.zoneId && zoneName.get(a.zoneId)].filter(Boolean).join(", ")}</span>
                    </span>
                  </span>
                  <DeleteAddress id={a.id} />
                </div>
              ))}
              <AddressForm zones={zones.map((z) => ({ value: z.id, label: z.name }))} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Password" />
            <CardBody><PasswordForm hasPassword={!!pw?.has} /></CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
