import Link from "next/link";
import { PackageX } from "lucide-react";
import { EmptyState, cn } from "@/components/ui";
import { ProductCard } from "@/components/shop/product-card";
import { categoriesWithCounts, listProducts, type CatalogSort } from "@/lib/services/catalog";
import { getSettings } from "@/lib/settings";

const SORTS: { key: CatalogSort; label: string }[] = [
  { key: "featured", label: "Popular" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "name", label: "A – Z" },
  { key: "newest", label: "Newest" },
];

export async function Catalog({ q, categorySlug, sort }: { q?: string; categorySlug?: string; sort?: CatalogSort }) {
  const [settings, cats, items] = await Promise.all([getSettings(), categoriesWithCounts(), listProducts({ q, categorySlug, sort, type: categorySlug === "services" ? undefined : "PRODUCT" })]);
  const c = settings.commerce;
  const secondary = c.showSecondaryPrices && c.secondaryCurrency ? { currency: c.secondaryCurrency, rate: c.exchangeRate } : null;
  const active = cats.find((x) => x.slug === categorySlug);
  const base = categorySlug ? `/shop/category/${categorySlug}` : "/shop";
  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, sort, ...next };
    Object.entries(merged).forEach(([k, v]) => v && v !== "featured" && p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{q ? `Results for “${q}”` : active ? active.name : "All products"}</h1>
        <p className="text-muted">{active?.description ?? `${items.length} farm products available for delivery or pickup.`}</p>
      </div>

      <div className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={`/shop${qs({})}`} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-1 transition", !categorySlug ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-fg ring-border hover:ring-border-strong")}>
          All
        </Link>
        {cats
          .filter((x) => x.slug !== "services")
          .map((cat) => (
            <Link
              key={cat.slug}
              href={`/shop/category/${cat.slug}${qs({})}`}
              className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-1 transition", categorySlug === cat.slug ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-fg ring-border hover:ring-border-strong")}
            >
              {cat.name} <span className="opacity-60">{cat.count}</span>
            </Link>
          ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <p className="text-muted">{items.length} {items.length === 1 ? "item" : "items"}</p>
        <div className="scrollbar-none flex gap-1 overflow-x-auto">
          {SORTS.map((s) => (
            <Link key={s.key} href={`${base}${qs({ sort: s.key })}`} className={cn("whitespace-nowrap rounded-lg px-2.5 py-1.5", (sort ?? "featured") === s.key ? "bg-surface-2 font-semibold text-fg" : "text-muted hover:text-fg")}>
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card mt-6">
          <EmptyState icon={<PackageX className="h-6 w-6" />} title="No products found" description="Try another search or browse all categories." action={<Link href="/shop" className="link">Browse everything</Link>} />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} p={p} currency={c.currency} secondary={secondary} />
          ))}
        </div>
      )}
    </div>
  );
}
