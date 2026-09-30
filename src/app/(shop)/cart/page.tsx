import Link from "next/link";
import { ArrowRight, ShieldCheck, ShoppingBag } from "lucide-react";
import { ButtonLink, EmptyState, Alert } from "@/components/ui";
import { CartLineControls, PromoForm } from "@/components/shop/cart-line";
import { SummaryRows } from "@/components/shop/order-summary";
import { ProductImage } from "@/components/shop/visuals";
import { getCart } from "@/lib/services/cart";
import { formatMoney } from "@/lib/money";
import { UNIT_LABELS, type SalesUnit } from "@/lib/constants";

export const metadata = { title: "Your cart" };

export default async function CartPage() {
  const cart = await getCart();
  const hasVariable = cart.lines.some((l) => l.variableWeight);
  const blocked = cart.lines.some((l) => l.problem);

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="card">
          <EmptyState
            icon={<ShoppingBag className="h-6 w-6" />}
            title="Your cart is empty"
            description="Browse fresh pork, live fish, piglets and aquaponic produce from our farm."
            action={<ButtonLink href="/shop">Start shopping</ButtonLink>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your cart</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="card divide-y divide-border">
          {cart.lines.map((l) => {
            const unit = UNIT_LABELS[l.unit as SalesUnit];
            return (
              <div key={l.id} className="flex gap-4 p-4 sm:p-5">
                <Link href={`/product/${l.slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:h-24 sm:w-24">
                  <ProductImage src={l.image} alt={l.name} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/product/${l.slug}`} className="font-semibold hover:underline">{l.name}</Link>
                      {l.options.length > 0 && <p className="text-sm text-muted">{l.options.map((o) => `${o.group}: ${o.choice}`).join(" · ")}</p>}
                      <p className="text-sm text-muted">
                        {formatMoney(l.unitPrice, cart.currency)} / {unit?.short ?? l.unit}
                        {l.variableWeight && " · weighed to order"}
                      </p>
                    </div>
                    <p className="tabular shrink-0 font-bold">{formatMoney(l.lineTotal, cart.currency)}</p>
                  </div>
                  {l.problem && <p className="mt-1 text-sm font-semibold text-danger">{l.problem}</p>}
                  <div className="mt-3">
                    <CartLineControls itemId={l.id} quantity={l.quantity} min={l.minQty} step={l.qtyStep} max={l.maxQty} unitLabel={unit?.short} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card space-y-4 p-5">
            <h2 className="font-semibold">Order summary</h2>
            <PromoForm code={cart.promoCode} />
            {cart.pricing.promotionError && cart.promoCode && <p className="text-sm text-danger">{cart.pricing.promotionError}</p>}
            <SummaryRows pricing={cart.pricing} currency={cart.currency} deliveryLabel="Delivery (at checkout)" />
            {hasVariable && (
              <Alert tone="info">Items sold by weight are charged for the actual weight. We&apos;ll confirm the final total before delivery.</Alert>
            )}
            {blocked ? (
              <Alert tone="danger">Please fix the items marked above before checking out.</Alert>
            ) : (
              <ButtonLink href="/checkout" size="lg" className="w-full">
                Checkout <ArrowRight className="h-5 w-5" aria-hidden />
              </ButtonLink>
            )}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Secure checkout · Pay on delivery available
            </p>
          </div>
          <Link href="/shop" className="link block text-center text-sm">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
