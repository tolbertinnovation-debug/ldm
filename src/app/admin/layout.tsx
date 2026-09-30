import Link from "next/link";
import { sql } from "drizzle-orm";
import { ExternalLink, LogOut, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { bookings, messages, orders, payments } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can, ROLE_META, type Permission, type StaffRole } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { AdminSidebar, MobileAdminNav, type NavGroup } from "@/components/admin/nav";
import { Avatar, ButtonLink } from "@/components/ui";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata = { title: { default: "Dashboard", template: "%s · Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff(undefined, "/admin");
  const role = user.role;
  const settings = await getSettings();
  const [counts] = await db
    .select({
      pendingOrders: sql<number>`(select count(*)::int from ${orders} where ${orders.status} = 'PENDING')`,
      unread: sql<number>`(select count(*)::int from ${messages} where ${messages.direction} = 'INBOUND' and ${messages.readAt} is null)`,
      bookingsNew: sql<number>`(select count(*)::int from ${bookings} where ${bookings.status} = 'REQUESTED')`,
      paymentsPending: sql<number>`(select count(*)::int from ${payments} where ${payments.status} = 'PENDING')`,
    })
    .from(sql`(select 1) as one`);

  const item = (perm: Permission, href: string, label: string, icon: string, badge?: number, exact?: boolean) => (can(role, perm) ? [{ href, label, icon, badge, exact }] : []);
  const groups: NavGroup[] = [
    { title: "Overview", items: [...item("dashboard:view", "/admin", "Dashboard", "dashboard", undefined, true), ...item("analytics:view", "/admin/analytics", "Analytics", "analytics")] },
    {
      title: "Sales",
      items: [
        ...item("orders:view", "/admin/orders", "Orders", "orders", counts?.pendingOrders),
        ...item("pos:use", "/admin/pos", "New order (POS)", "pos"),
        ...item("deliveries:view", "/admin/deliveries", "Deliveries", "deliveries"),
        ...item("bookings:manage", "/admin/bookings", "Bookings", "bookings", counts?.bookingsNew),
        ...item("customers:view", "/admin/customers", "Customers", "customers"),
      ],
    },
    {
      title: "Farm & stock",
      items: [...item("products:view", "/admin/products", "Products", "products"), ...item("inventory:view", "/admin/inventory", "Inventory", "inventory"), ...item("livestock:manage", "/admin/livestock", "Livestock & ponds", "livestock")],
    },
    {
      title: "Engage",
      items: [
        ...item("messages:view", "/admin/messages", "Inbox", "messages", counts?.unread),
        ...item("broadcasts:manage", "/admin/broadcasts", "Broadcasts", "broadcasts"),
        ...item("marketing:manage", "/admin/campaigns", "Ad campaigns", "campaigns"),
        ...item("marketing:manage", "/admin/promotions", "Promotions", "promotions"),
        ...item("marketing:manage", "/admin/social", "Social media", "social"),
      ],
    },
    {
      title: "Money",
      items: [
        ...item("payments:view", "/admin/payments", "Payments", "payments", counts?.paymentsPending),
        ...item("invoices:manage", "/admin/invoices", "Invoices", "invoices"),
        ...item("expenses:manage", "/admin/expenses", "Expenses", "expenses"),
        ...item("finance:view", "/admin/finance", "Financial reports", "reports"),
        ...item("reports:view", "/admin/reports", "Reports & exports", "tasks"),
      ],
    },
    {
      title: "Admin",
      items: [
        ...item("staff:manage", "/admin/staff", "Staff & access", "staff"),
        ...item("audit:view", "/admin/audit", "Audit log", "audit"),
        ...item("settings:manage", "/admin/settings", "Settings", "settings"),
        { href: "/admin/security", label: "My security", icon: "security" },
      ],
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="min-h-dvh bg-bg">
      <AdminSidebar groups={groups} business={settings.business.name} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <MobileAdminNav groups={groups} business={settings.business.name} />
          <div className="flex-1" />
          {can(role, "pos:use") && (
            <ButtonLink href="/admin/pos" size="sm" className="hidden sm:inline-flex">
              <Plus className="h-4 w-4" aria-hidden /> New order
            </ButtonLink>
          )}
          <Link href="/" target="_blank" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg sm:flex">
            <ExternalLink className="h-4 w-4" aria-hidden /> Store
          </Link>
          <div className="flex items-center gap-2.5 border-l border-border pl-3">
            <Avatar name={user.name} className="h-8 w-8" />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-muted">{ROLE_META[role as StaffRole]?.label ?? role}</p>
            </div>
            <form action={logoutAction}>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Sign out" title="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
