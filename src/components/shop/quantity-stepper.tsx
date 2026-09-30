"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui";

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function QuantityStepper({
  name = "quantity",
  min,
  step,
  max,
  defaultValue,
  unitLabel,
  onChange,
  size = "md",
}: {
  name?: string;
  min: number;
  step: number;
  max?: number | null;
  defaultValue?: number;
  unitLabel?: string;
  onChange?: (v: number) => void;
  size?: "sm" | "md";
}) {
  const [value, setValue] = useState<number>(defaultValue ?? min);
  const set = (v: number) => {
    const clamped = round(Math.max(min, max ? Math.min(max, v) : v));
    setValue(clamped);
    onChange?.(clamped);
  };
  const h = size === "sm" ? "h-9" : "h-11";
  return (
    <div className={cn("inline-flex items-center rounded-xl border border-border-strong bg-surface", h)}>
      <button type="button" onClick={() => set(value - step)} disabled={value <= min} className={cn("grid place-items-center text-fg disabled:opacity-30", size === "sm" ? "w-9" : "w-11")} aria-label="Decrease quantity">
        <Minus className="h-4 w-4" />
      </button>
      <label className="flex items-baseline gap-1 px-1">
        <span className="sr-only">Quantity</span>
        <input
          name={name}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          max={max ?? undefined}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            setValue(v);
            onChange?.(v);
          }}
          onBlur={() => set(value || min)}
          className="w-14 bg-transparent text-center text-[15px] font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unitLabel && <span className="text-xs text-muted">{unitLabel}</span>}
      </label>
      <button type="button" onClick={() => set(value + step)} disabled={!!max && value >= max} className={cn("grid place-items-center text-fg disabled:opacity-30", size === "sm" ? "w-9" : "w-11")} aria-label="Increase quantity">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
