import Link from "next/link";
import { Badge } from "@/components/ui";
import { stockLabel, type ProductCardData } from "@/lib/services/catalog";
import { Price, ProductImage } from "./visuals";
import { QuickAdd } from "./quick-add";

export function ProductCard({
  p,
  currency,
  secondary,
}: {
  p: ProductCardData;
  currency: string;
  secondary?: { currency: string; rate: number } | null;
}) {
  const stock = stockLabel(p);
  const href = p.type === "SERVICE" ? `/services/${p.slug}` : `/product/${p.slug}`;
  const quickAdd = p.type === "PRODUCT" && !p.hasOptions && !stock.soldOut;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-surface-2">
        <ProductImage src={p.images[0]} alt={p.name} icon={p.categoryIcon} className="transition duration-300 group-hover:scale-[1.03]" />
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {p.compareAtPrice && p.compareAtPrice > p.price && <Badge tone="accent">Sale</Badge>}
          {stock.label !== "In stock" && stock.label !== "Available" && <Badge tone={stock.tone}>{stock.label}</Badge>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{p.categoryName}</p>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-fg">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {p.name}
          </Link>
        </h3>
        {p.shortDescription && <p className="mt-1 line-clamp-2 hidden text-[13px] text-muted sm:block">{p.shortDescription}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <Price cents={p.price} currency={currency} unit={p.unit} compareAt={p.compareAtPrice} secondary={secondary} />
          {quickAdd ? (
            <div className="relative z-10">
              <QuickAdd productId={p.id} quantity={p.minQty} label={p.name} />
            </div>
          ) : (
            <span className="relative z-10 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-fg">
              {p.type === "SERVICE" ? "Book" : stock.soldOut ? "Sold out" : "Choose"}
            </span>
          )}
        </div>
        {p.variableWeight && <p className="mt-1.5 text-[11px] text-muted">Weighed to order</p>}
      </div>
    </article>
  );
}
