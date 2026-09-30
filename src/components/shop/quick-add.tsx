"use client";

import { Plus } from "lucide-react";
import { Form, SubmitButton } from "@/components/form";
import { addToCartAction } from "@/app/(shop)/actions";

export function QuickAdd({ productId, quantity, label }: { productId: string; quantity: number; label: string }) {
  return (
    <Form action={addToCartAction} refresh>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value={quantity} />
      <SubmitButton size="sm" className="!h-9 !w-9 !rounded-full !px-0" pendingText="">
        <Plus className="h-4 w-4" aria-hidden />
        <span className="sr-only">Add {label} to cart</span>
      </SubmitButton>
    </Form>
  );
}
