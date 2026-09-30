import { desc, eq, sql } from "drizzle-orm";
import { CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { centsToInput } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { BOOKING_STATUS_META } from "@/lib/constants";
import { Card, EmptyState, PageHeader, StatusBadge, Tabs } from "@/components/ui";
import { BookingControls } from "@/components/admin/booking-form";
import { sp } from "@/components/admin/bits";

export const metadata = { title: "Bookings" };

export default async function BookingsPage(props: PageProps<"/admin/bookings">) {
  const user = await requireStaff("bookings:manage");
  const status = sp((await props.searchParams).status) ?? "open";
  const rows = await db
    .select()
    .from(bookings)
    .where(status === "open" ? sql`${bookings.status} in ('REQUESTED','CONFIRMED')` : status === "all" ? undefined : eq(bookings.status, status as "COMPLETED"))
    .orderBy(desc(bookings.createdAt))
    .limit(200);
  return (
    <>
      <PageHeader title="Service bookings" description="Slaughter & processing, training courses, installations, farm visits and tours." />
      <Tabs active={status} tabs={[{ key: "open", label: "Open", href: "/admin/bookings" }, { key: "COMPLETED", label: "Completed", href: "/admin/bookings?status=COMPLETED" }, { key: "CANCELLED", label: "Cancelled", href: "/admin/bookings?status=CANCELLED" }, { key: "all", label: "All", href: "/admin/bookings?status=all" }]} />
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <Card><EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No bookings here" /></Card>}
        {rows.map((b) => (
          <Card key={b.id} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{b.serviceName} <span className="font-normal text-muted">· {b.number}</span></p>
                <p className="text-sm">{b.contactName} · <a href={`tel:${b.contactPhone}`} className="link">{formatPhone(b.contactPhone)}</a>{b.contactEmail && ` · ${b.contactEmail}`}</p>
                <p className="text-sm text-muted">
                  {b.preferredDate ? formatDate(b.preferredDate) : "No date yet"}{b.preferredTime && `, ${b.preferredTime}`} · {b.participants} {b.participants === 1 ? "person/unit" : "people/units"}{b.location && ` · ${b.location}`} · requested {timeAgo(b.createdAt)}
                </p>
                {b.details && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">{b.details}</p>}
              </div>
              <StatusBadge status={b.status} meta={BOOKING_STATUS_META} />
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <BookingControls canInvoice={can(user.role, "invoices:manage")} b={{ id: b.id, status: b.status, preferredDate: b.preferredDate, preferredTime: b.preferredTime, quotedAmount: centsToInput(b.quotedAmount), internalNote: b.internalNote ?? "" }} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
