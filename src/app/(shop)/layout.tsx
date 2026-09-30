import Link from "next/link";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { Mail, MapPin, Phone, ShoppingBag, User } from "lucide-react";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/permissions";
import { cartCount } from "@/lib/services/cart";
import { getSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/phone";
import { Logo } from "@/components/logo";
import { MobileNav } from "@/components/shop/mobile-nav";
import { SearchBox } from "@/components/shop/search-box";
import { SocialIcon } from "@/components/shop/visuals";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [settings, user, count, cats] = await Promise.all([
    getSettings(),
    getCurrentUser(),
    cartCount(),
    db.select({ name: categories.name, slug: categories.slug }).from(categories).where(eq(categories.active, true)).orderBy(asc(categories.sortOrder)),
  ]);
  const b = settings.business;
  const socials = (["facebook", "instagram", "tiktok", "x", "youtube"] as const).filter((k) => b.social[k]);

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
      {settings.commerce.announcement && (
        <div className="bg-brand-800 px-4 py-2 text-center text-[13px] font-medium text-white">{settings.commerce.announcement}</div>
      )}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label={`${b.name} home`} className="shrink-0">
            <Logo name={b.name} tagline="Farm to table" />
          </Link>
          <Suspense fallback={<div className="hidden flex-1 md:block" />}>
            <SearchBox className="mx-auto hidden w-full max-w-md md:block" />
          </Suspense>
          <nav className="ml-auto hidden items-center gap-1 text-sm font-medium md:flex" aria-label="Main">
            <Link href="/shop" className="rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg">Shop</Link>
            <Link href="/services" className="rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg">Services</Link>
            <Link href="/track" className="rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg">Track order</Link>
            {user && isStaffRole(user.role) && (
              <Link href={user.role === "DRIVER" ? "/driver" : "/admin"} className="rounded-lg px-3 py-2 text-primary hover:bg-primary-soft">
                {user.role === "DRIVER" ? "Driver app" : "Dashboard"}
              </Link>
            )}
            <Link href={user ? "/account" : "/login"} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg">
              <User className="h-4 w-4" aria-hidden /> {user ? user.name.split(" ")[0] : "Sign in"}
            </Link>
          </nav>
          <Link href="/cart" className="relative ml-auto grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-fg shadow-sm transition hover:bg-primary-hover md:ml-0" aria-label={`Cart, ${count} items`}>
            <ShoppingBag className="h-5 w-5" aria-hidden />
            {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white ring-2 ring-surface">{count}</span>}
          </Link>
        </div>
        <div className="scrollbar-none mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6 md:hidden">
          <Suspense>
            <SearchBox className="w-full min-w-[260px]" autoFocusParam />
          </Suspense>
        </div>
        <nav className="scrollbar-none mx-auto hidden max-w-7xl gap-1 overflow-x-auto px-4 pb-2 text-[13px] font-medium sm:px-6 md:flex" aria-label="Categories">
          {cats.map((c) => (
            <Link key={c.slug} href={`/shop/category/${c.slug}`} className="whitespace-nowrap rounded-full px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
              {c.name}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo name={b.name} tagline="Farm to table" />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">{b.about}</p>
            {socials.length > 0 && (
              <div className="mt-4 flex gap-2">
                {socials.map((k) => (
                  <a key={k} href={b.social[k]} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted hover:text-fg" aria-label={k}>
                    <SocialIcon name={k} className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Shop</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {cats.slice(0, 6).map((c) => (
                <li key={c.slug}><Link href={`/shop/category/${c.slug}`} className="hover:text-fg">{c.name}</Link></li>
              ))}
              <li><Link href="/track" className="hover:text-fg">Track an order</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Visit & contact</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-muted">
              <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{b.address}, {b.city}, {b.country}</li>
              <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><a href={`tel:${b.phone.replace(/\s/g, "")}`} className="hover:text-fg">{b.phone}</a></li>
              {b.whatsapp && <li className="flex gap-2"><SocialIcon name="whatsapp" className="mt-0.5 h-4 w-4 shrink-0" /><a href={whatsappLink(b.whatsapp, "Hello REAP, I would like to order")} className="hover:text-fg">Chat on WhatsApp</a></li>}
              <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><a href={`mailto:${b.email}`} className="hover:text-fg">{b.email}</a></li>
              <li className="pl-6">{b.hours}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-subtle sm:flex-row sm:justify-between sm:px-6">
            <p>© {new Date().getFullYear()} {b.legalName}. All rights reserved.</p>
            <p className="flex gap-4">
              <Link href="/about" className="hover:text-fg">About REAP</Link>
              <Link href="/privacy" className="hover:text-fg">Privacy</Link>
              {b.website && <a href={b.website} className="hover:text-fg" target="_blank" rel="noopener noreferrer">{b.website.replace(/^https?:\/\/(www\.)?/, "")}</a>}
            </p>
          </div>
        </div>
      </footer>
      <MobileNav cartCount={count} signedIn={!!user} />
    </div>
  );
}
