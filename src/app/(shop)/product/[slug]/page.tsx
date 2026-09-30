import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Info, Scale, Store, Truck } from "lucide-react";
import { Badge } from "@/components/ui";
import { AddToCartForm } from "@/components/shop/add-to-cart-form";
import { ProductCard } from "@/components/shop/product-card";
import { Price, ProductImage, SocialIcon } from "@/components/shop/visuals";
import { getProductBySlug, listProducts, stockLabel } from "@/lib/services/catalog";
import { getSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/phone";
import { appUrl } from "@/lib/request";
import { formatQuantity } from "@/lib/constants";

export async function generateMetadata(props: PageProps<"/product/[slug]">) {
  const { slug } = await props.params;
  const row = await getProductBySlug(slug);
  if (!row) return {};
  return { title: row.product.name, description: row.product.shortDescription ?? undefined, openGraph: { images: row.product.images.slice(0, 1) } };
}

export default async function ProductPage(props: PageProps<"/product/[slug]">) {
  const { slug } = await props.params;
  const row = await getProductBySlug(slug);
  if (!row || row.product.type !== "PRODUCT") notFound();
  const { product: p, category } = row;
  const settings = await getSettings();
  const c = settings.commerce;
  const secondary = c.showSecondaryPrices && c.secondaryCurrency ? { currency: c.secondaryCurrency, rate: c.exchangeRate } : null;
  const stock = stockLabel(p);
  const related = (await listProducts({ categorySlug: category?.slug, type: "PRODUCT", limit: 5 })).filter((x) => x.id !== p.id).slice(0, 4);
  const attrs = Object.entries(p.attributes);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.shortDescription,
    sku: p.sku,
    image: p.images,
    offers: {
      "@type": "Offer",
      priceCurrency: c.currency,
      price: (p.price / 100).toFixed(2),
      availability: stock.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      url: appUrl(`/product/${p.slug}`),
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-5 flex items-center gap-1.5 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/shop" className="hover:text-fg">Shop</Link>
        {category && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/shop/category/${category.slug}`} className="hover:text-fg">{category.name}</Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-3xl border border-border bg-surface-2">
            <ProductImage src={p.images[0]} alt={p.name} icon={category?.icon} size="lg" />
          </div>
          {p.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {p.images.slice(1, 5).map((src) => (
                <div key={src} className="aspect-square overflow-hidden rounded-2xl border border-border">
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stock.tone} dot>{stock.label}</Badge>
            {p.variableWeight && <Badge tone="info">Weighed to order</Badge>}
            {p.compareAtPrice && p.compareAtPrice > p.price && <Badge tone="accent">On sale</Badge>}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{p.name}</h1>
          {p.shortDescription && <p className="mt-3 text-[17px] leading-relaxed text-muted">{p.shortDescription}</p>}
          <Price cents={p.price} currency={c.currency} unit={p.unit} compareAt={p.compareAtPrice} secondary={secondary} size="lg" className="mt-5" />
          {p.pricingNote && (
            <p className="mt-3 flex gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info-fg">
              <Scale className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {p.pricingNote}
            </p>
          )}

          <div className="mt-6 border-t border-border pt-6">
            <AddToCartForm
              product={{ id: p.id, price: p.price, unit: p.unit, minQty: p.minQty, qtyStep: p.qtyStep, maxQty: p.maxQty, options: p.options, variableWeight: p.variableWeight }}
              currency={c.currency}
              soldOut={stock.soldOut}
            />
          </div>

          <ul className="mt-6 grid gap-2.5 text-sm">
            <li className="flex items-center gap-2.5">
              <Truck className="h-4 w-4 text-primary" aria-hidden />
              {p.allowDelivery ? "Delivery available across Monrovia & Montserrado" : "Pickup only — not available for delivery"}
            </li>
            {p.allowPickup && (
              <li className="flex items-center gap-2.5">
                <Store className="h-4 w-4 text-primary" aria-hidden /> Free pickup at the REAP farm, Bentol City
              </li>
            )}
            {p.leadTimeDays > 0 && (
              <li className="flex items-center gap-2.5">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden /> Please order at least {p.leadTimeDays} day{p.leadTimeDays > 1 ? "s" : ""} ahead
              </li>
            )}
            {p.trackInventory && p.stockQty > 0 && p.stockQty <= Math.max(p.lowStockThreshold, 5) && (
              <li className="flex items-center gap-2.5 text-warning-fg">
                <Info className="h-4 w-4" aria-hidden /> Only {formatQuantity(p.stockQty, p.unit)} left
              </li>
            )}
          </ul>

          {settings.business.whatsapp && (
            <a
              href={whatsappLink(settings.business.whatsapp, `Hello, I have a question about ${p.name} (${appUrl(`/product/${p.slug}`)})`)}
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#128C4B] hover:underline"
            >
              <SocialIcon name="whatsapp" className="h-4 w-4" /> Ask about this product on WhatsApp
            </a>
          )}

          {(p.description || attrs.length > 0) && (
            <div className="mt-8 space-y-5 border-t border-border pt-6">
              {attrs.length > 0 && (
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  {attrs.map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-surface-2 p-3">
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="mt-0.5 font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {p.description && <p className="whitespace-pre-line leading-relaxed text-muted">{p.description}</p>}
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold tracking-tight">You may also like</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {related.map((r) => (
              <ProductCard key={r.id} p={r} currency={c.currency} secondary={secondary} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
