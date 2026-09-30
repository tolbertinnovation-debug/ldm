"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LayoutGrid, Search, ShoppingBag, User } from "lucide-react";
import { cn } from "@/components/ui";

/** Thumb-reachable bottom navigation for phones. */
export function MobileNav({ cartCount, signedIn }: { cartCount: number; signedIn: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Home", icon: House, active: path === "/" },
    { href: "/shop", label: "Shop", icon: LayoutGrid, active: path.startsWith("/shop") || path.startsWith("/product") },
    { href: "/shop?focus=search", label: "Search", icon: Search, active: false },
    { href: "/cart", label: "Cart", icon: ShoppingBag, active: path.startsWith("/cart") || path.startsWith("/checkout"), badge: cartCount },
    { href: signedIn ? "/account" : "/login", label: signedIn ? "Account" : "Sign in", icon: User, active: path.startsWith("/account") || path.startsWith("/login") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
      <ul className="grid grid-cols-5">
        {items.map((it) => (
          <li key={it.label}>
            <Link href={it.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", it.active ? "text-primary" : "text-muted")}>
              <it.icon className="h-[22px] w-[22px]" strokeWidth={it.active ? 2.3 : 1.8} aria-hidden />
              {it.label}
              {!!it.badge && (
                <span className="absolute right-[calc(50%-20px)] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{it.badge}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
