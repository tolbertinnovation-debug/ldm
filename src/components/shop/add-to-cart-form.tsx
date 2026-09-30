"use client";

import { useMemo, useState } from "react";
import { ShoppingBag, Zap } from "lucide-react";
import { Form, SubmitButton } from "@/components/form";
import { cn } from "@/components/ui";
import { addToCartAction } from "@/app/(shop)/actions";
import { formatMoney, lineTotal } from "@/lib/money";
import { UNIT_LABELS, type SalesUnit } from "@/lib/constants";
import type { ProductOptionGroup } from "@/lib/db/schema";
import { QuantityStepper } from "./quantity-stepper";

export function AddToCartForm({
  product,
  currency,
  soldOut,
}: {
  product: { id: string; price: number; unit: string; minQty: number; qtyStep: number; maxQty: number | null; options: ProductOptionGroup[]; variableWeight: boolean };
  currency: string;
  soldOut: boolean;
}) {
  const [qty, setQty] = useState(product.minQty);
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(product.options.filter((g) => g.required).map((g) => [g.name, g.choices[0]?.label ?? ""])),
  );
  const unitPrice = useMemo(
    () =>
      product.price +
      product.options.reduce((sum, g) => sum + (g.choices.find((c) => c.label === choices[g.name])?.priceDelta ?? 0), 0),
    [choices, product],
  );
  const unit = UNIT_LABELS[product.unit as SalesUnit];

  return (
    <Form action={addToCartAction} refresh className="space-y-5">
      <input type="hidden" name="productId" value={product.id} />
      {product.options.map((g) => (
        <fieldset key={g.name}>
          <legend className="mb-2 text-sm font-semibold">
            {g.name} {g.required && <span className="text-danger">*</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {!g.required && (
              <OptionChip name={g.name} value="" label="None" selected={!choices[g.name]} onSelect={() => setChoices((c) => ({ ...c, [g.name]: "" }))} />
            )}
            {g.choices.map((c) => (
              <OptionChip
                key={c.label}
                name={g.name}
                value={c.label}
                label={c.label}
                extra={c.priceDelta ? `+${formatMoney(c.priceDelta, currency)}${unit ? `/${unit.short}` : ""}` : undefined}
                selected={choices[g.name] === c.label}
                onSelect={() => setChoices((prev) => ({ ...prev, [g.name]: c.label }))}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <div>
        <p className="mb-2 text-sm font-semibold">{product.variableWeight ? `Estimated weight (${unit?.plural ?? ""})` : "Quantity"}</p>
        <div className="flex flex-wrap items-center gap-4">
          <QuantityStepper min={product.minQty} step={product.qtyStep} max={product.maxQty} defaultValue={product.minQty} unitLabel={unit?.short} onChange={setQty} />
          <p className="text-sm text-muted">
            Subtotal <span className="tabular text-base font-bold text-fg">{formatMoney(lineTotal(unitPrice, qty || 0), currency)}</span>
            {product.variableWeight && <span className="block text-xs">Final price based on actual weight</span>}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <SubmitButton size="lg" className="flex-1" pendingText="Adding…" disabled={soldOut}>
          <ShoppingBag className="h-5 w-5" aria-hidden /> {soldOut ? "Sold out" : "Add to cart"}
        </SubmitButton>
        {!soldOut && (
          <SubmitButton size="lg" variant="accent" name="buyNow" value="1" className="flex-1">
            <Zap className="h-5 w-5" aria-hidden /> Buy now
          </SubmitButton>
        )}
      </div>
    </Form>
  );
}

function OptionChip({ name, value, label, extra, selected, onSelect }: { name: string; value: string; label: string; extra?: string; selected: boolean; onSelect: () => void }) {
  return (
    <label className={cn("cursor-pointer rounded-xl border px-3.5 py-2 text-sm transition", selected ? "border-primary bg-primary-soft font-semibold text-primary-soft-fg ring-2 ring-primary/20" : "border-border-strong bg-surface hover:border-primary/50")}>
      <input type="radio" name={`opt:${name}`} value={value} checked={selected} onChange={onSelect} className="sr-only" />
      {label}
      {extra && <span className="ml-1.5 text-xs opacity-75">{extra}</span>}
    </label>
  );
}
