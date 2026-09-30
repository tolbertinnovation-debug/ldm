import { formatMoney } from "@/lib/money";
import type { PricingResult } from "@/lib/pricing";

export function SummaryRows({ pricing, currency, showDelivery = true, deliveryLabel }: { pricing: Pick<PricingResult, "subtotal" | "discounts" | "discountTotal" | "deliveryFee" | "freeDelivery" | "taxTotal" | "total">; currency: string; showDelivery?: boolean; deliveryLabel?: string }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted">Subtotal</dt>
        <dd className="tabular font-medium">{formatMoney(pricing.subtotal, currency)}</dd>
      </div>
      {pricing.discounts.map((d) => (
        <div key={d.label} className="flex justify-between text-success-fg">
          <dt>{d.label}</dt>
          <dd className="tabular font-medium">−{formatMoney(d.amount, currency)}</dd>
        </div>
      ))}
      {showDelivery && (
        <div className="flex justify-between">
          <dt className="text-muted">{deliveryLabel ?? "Delivery"}</dt>
          <dd className="tabular font-medium">{pricing.freeDelivery ? <span className="text-success-fg">Free</span> : pricing.deliveryFee ? formatMoney(pricing.deliveryFee, currency) : "—"}</dd>
        </div>
      )}
      {pricing.taxTotal > 0 && (
        <div className="flex justify-between">
          <dt className="text-muted">Tax</dt>
          <dd className="tabular font-medium">{formatMoney(pricing.taxTotal, currency)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-border pt-3 text-base">
        <dt className="font-semibold">Total</dt>
        <dd className="tabular font-bold">{formatMoney(pricing.total, currency)}</dd>
      </div>
    </dl>
  );
}
