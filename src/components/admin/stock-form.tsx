"use client";

import { useState } from "react";
import { Field, Form, Input, Select, SubmitButton } from "@/components/form";
import { adjustStockAction } from "@/app/admin/inventory/actions";

const MODES = [
  { value: "RECEIVE", label: "Receive / purchase (+)" },
  { value: "PRODUCTION", label: "Harvest / produced (+)" },
  { value: "SPOILAGE", label: "Spoiled / damaged (−)" },
  { value: "MORTALITY", label: "Animal died (−)" },
  { value: "COUNT", label: "Stock count (set exact)" },
  { value: "ADJUSTMENT", label: "Manual correction (±)" },
];

export function StockForm({ productId, unit, compact }: { productId: string; unit: string; compact?: boolean }) {
  const [mode, setMode] = useState("RECEIVE");
  return (
    <Form action={adjustStockAction} resetOnSuccess refresh className={compact ? "flex flex-wrap items-end gap-2" : "space-y-3"}>
      <input type="hidden" name="productId" value={productId} />
      <Field label={compact ? undefined : "What happened?"} name="mode" className={compact ? "min-w-44" : undefined}>
        <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value)} options={MODES} className={compact ? "h-9 text-sm" : undefined} />
      </Field>
      <Field label={compact ? undefined : mode === "COUNT" ? `Counted quantity (${unit})` : `Quantity (${unit})`} name="quantity" className={compact ? "w-28" : undefined}>
        <Input name="quantity" type="number" step="0.001" placeholder={mode === "COUNT" ? "Counted" : "Qty"} className={compact ? "h-9 text-sm" : undefined} />
      </Field>
      {!compact && mode === "RECEIVE" && (
        <Field label="Unit cost" name="unitCost" optional>
          <Input name="unitCost" inputMode="decimal" placeholder="0.00" />
        </Field>
      )}
      {!compact && (
        <Field label="Note" name="note" optional>
          <Input name="note" placeholder="e.g. Harvest from Pond 1" />
        </Field>
      )}
      <SubmitButton size={compact ? "sm" : "md"} variant={compact ? "outline" : "primary"}>Update stock</SubmitButton>
    </Form>
  );
}
