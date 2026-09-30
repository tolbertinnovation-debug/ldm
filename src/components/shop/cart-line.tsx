"use client";

import { useState } from "react";
import { Tag, Trash2 } from "lucide-react";
import { Form, Input, SubmitButton } from "@/components/form";
import { applyPromoAction, updateCartItemAction } from "@/app/(shop)/actions";
import { QuantityStepper } from "./quantity-stepper";

export function CartLineControls({ itemId, quantity, min, step, max, unitLabel }: { itemId: string; quantity: number; min: number; step: number; max: number | null; unitLabel?: string }) {
  const [dirty, setDirty] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Form action={updateCartItemAction} refresh toastOnSuccess={false} onSuccess={() => setDirty(false)} className="flex items-center gap-2">
        <input type="hidden" name="itemId" value={itemId} />
        <QuantityStepper min={min} step={step} max={max} defaultValue={quantity} unitLabel={unitLabel} size="sm" onChange={(v) => setDirty(v !== quantity)} />
        {dirty && (
          <SubmitButton size="sm" variant="secondary">
            Update
          </SubmitButton>
        )}
      </Form>
      <Form action={updateCartItemAction} refresh>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value="0" />
        <SubmitButton size="sm" variant="ghost" className="!px-2 text-muted">
          <Trash2 className="h-4 w-4" aria-hidden />
          <span className="sr-only">Remove</span>
        </SubmitButton>
      </Form>
    </div>
  );
}

export function PromoForm({ code }: { code: string | null }) {
  if (code) {
    return (
      <Form action={applyPromoAction} refresh className="flex items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-soft-fg">
        <span className="flex items-center gap-2 font-semibold">
          <Tag className="h-4 w-4" aria-hidden /> {code}
        </span>
        <input type="hidden" name="remove" value="1" />
        <SubmitButton size="sm" variant="ghost">
          Remove
        </SubmitButton>
      </Form>
    );
  }
  return (
    <Form action={applyPromoAction} refresh className="flex gap-2">
      <Input name="promoCode" placeholder="Promo code" autoCapitalize="characters" aria-label="Promo code" className="uppercase" />
      <SubmitButton variant="outline">Apply</SubmitButton>
    </Form>
  );
}
