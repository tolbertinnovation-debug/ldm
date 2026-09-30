"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Boxes, CalendarDays, ClipboardList, FileText, Inbox, LayoutDashboard, LineChart, Megaphone, Menu, PiggyBank, Plus, Receipt,
  ScrollText, Send, Settings, Share2, ShieldCheck, ShoppingCart, Tag, Truck, Users, UserCog, Wallet, X, Package, type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui";
import { LogoMark } from "@/components/logo";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, orders: ShoppingCart, pos: Plus, deliveries: Truck, bookings: CalendarDays, products: Package, inventory: Boxes,
  livestock: PiggyBank, customers: Users, messages: Inbox, broadcasts: Send, campaigns: Megaphone, promotions: Tag, social: Share2,
  payments: Wallet, invoices: FileText, expenses: Receipt, reports: BarChart3, analytics: LineChart, staff: UserCog, audit: ScrollText,
  settings: Settings, security: ShieldCheck, tasks: ClipboardList,
};

export type NavItem = { href: string; label: string; icon: string; badge?: number; exact?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-5" aria-label="Admin">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-300/70">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon] ?? LayoutDashboard;
              const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition",
                      active ? "bg-white/12 text-white" : "text-brand-100/80 hover:bg-white/6 hover:text-white",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                    <span className="flex-1">{it.label}</span>
                    {!!it.badge && <span className="rounded-full bg-harvest-500 px-1.5 text-[11px] font-bold text-white">{it.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebar({ groups, business }: { groups: NavGroup[]; business: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-950 lg:flex">
      <Link href="/admin" className="flex h-16 items-center gap-2.5 px-5">
        <LogoMark className="h-8 w-8" />
        <span className="font-bold text-white">{business}</span>
      </Link>
      <div className="scrollbar-none flex-1 overflow-y-auto px-3 pb-6">
        <NavLinks groups={groups} />
      </div>
    </aside>
  );
}

export function MobileAdminNav({ groups, business }: { groups: NavGroup[]; business: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-fg hover:bg-surface-2 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-slide-in-left flex-col bg-brand-950">
            <div className="flex h-16 items-center justify-between px-5">
              <span className="flex items-center gap-2.5 font-bold text-white"><LogoMark className="h-8 w-8" /> {business}</span>
              <button onClick={() => setOpen(false)} className="text-white/80" aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-8">
              <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
