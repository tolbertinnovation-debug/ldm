"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Checkbox, Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { Button } from "@/components/ui";
import { saveProductAction } from "@/app/admin/products/actions";
import { SALES_UNITS, UNIT_LABELS } from "@/lib/constants";
import type { ProductOptionGroup } from "@/lib/db/schema";
import { ImageUploader } from "./image-uploader";

export type ProductFormValues = {
  id?: string;
  type: "PRODUCT" | "SERVICE";
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  unit: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  pricingNote: string;
  variableWeight: boolean;
  minQty: number;
  qtyStep: number;
  maxQty: string;
  trackInventory: boolean;
  lowStockThreshold: number;
  allowBackorder: boolean;
  availability: string;
  leadTimeDays: number;
  allowDelivery: boolean;
  allowPickup: boolean;
  taxable: boolean;
  status: string;
  featured: boolean;
  tags: string;
  attributes: string;
  options: ProductOptionGroup[];
  images: string[];
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card grid gap-5 p-5 sm:p-6 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function ProductForm({ v, categories, currency }: { v: ProductFormValues; categories: { value: string; label: string }[]; currency: string }) {
  const [type, setType] = useState(v.type);
  const [track, setTrack] = useState(v.trackInventory);
  const [groups, setGroups] = useState<ProductOptionGroup[]>(v.options);
  const isNew = !v.id;

  const updateGroup = (i: number, patch: Partial<ProductOptionGroup>) => setGroups((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Form action={saveProductAction} className="space-y-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <input type="hidden" name="options" value={JSON.stringify(groups)} />

      <Section title="Basics" description="What customers see in the shop.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" name="type">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value as "PRODUCT" | "SERVICE")} options={[{ value: "PRODUCT", label: "Product (sold in shop)" }, { value: "SERVICE", label: "Service (booked)" }]} />
          </Field>
          <Field label="Category" name="categoryId">
            <Select name="categoryId" defaultValue={v.categoryId} placeholder="No category" options={categories} />
          </Field>
          <Field label="Name" name="name" required className="sm:col-span-2">
            <Input name="name" defaultValue={v.name} />
          </Field>
          <Field label="Short description" name="shortDescription" className="sm:col-span-2" hint="One line shown on product cards.">
            <Input name="shortDescription" defaultValue={v.shortDescription} maxLength={300} />
          </Field>
          <Field label="Full description" name="description" className="sm:col-span-2">
            <Textarea name="description" rows={5} defaultValue={v.description} />
          </Field>
        </div>
      </Section>

      <Section title="Photos">
        <ImageUploader name="images" initial={v.images} />
      </Section>

      <Section title="Pricing" description={`Prices in ${currency}. Weighed items are priced per pound/kilo and re-totalled when weighed.`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sold per" name="unit">
            <Select name="unit" defaultValue={v.unit} options={SALES_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u].singular }))} />
          </Field>
          <Field label="Price" name="price" required>
            <Input name="price" inputMode="decimal" defaultValue={v.price} />
          </Field>
          <Field label="Compare-at price" name="compareAtPrice" optional hint="Shows as a sale">
            <Input name="compareAtPrice" inputMode="decimal" defaultValue={v.compareAtPrice} />
          </Field>
          <Field label="Cost price" name="costPrice" optional hint="For profit reports">
            <Input name="costPrice" inputMode="decimal" defaultValue={v.costPrice} />
          </Field>
          <Field label="Pricing note" name="pricingNote" optional className="sm:col-span-2">
            <Input name="pricingNote" defaultValue={v.pricingNote} placeholder="e.g. Final price based on actual weight" />
          </Field>
        </div>
        <Checkbox name="variableWeight" label="Weighed to order" description="Customer orders an estimated weight; staff enter the actual weight before completing." defaultChecked={v.variableWeight} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum quantity" name="minQty"><Input name="minQty" type="number" step="0.001" defaultValue={v.minQty} /></Field>
          <Field label="Quantity step" name="qtyStep"><Input name="qtyStep" type="number" step="0.001" defaultValue={v.qtyStep} /></Field>
          <Field label="Maximum per order" name="maxQty" optional><Input name="maxQty" type="number" step="0.001" defaultValue={v.maxQty} /></Field>
        </div>
      </Section>

      <Section title="Options" description="Choices like slaughter & cleaning, cut style or preparation. Price change applies per unit.">
        {groups.map((g, i) => (
          <div key={i} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <input value={g.name} onChange={(e) => updateGroup(i, { name: e.target.value })} placeholder="Option name (e.g. Preparation)" className="field h-9 max-w-xs flex-1" aria-label="Option name" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={g.required} onChange={(e) => updateGroup(i, { required: e.target.checked })} className="accent-[var(--primary)]" /> Required</label>
              <button type="button" onClick={() => setGroups((x) => x.filter((_, j) => j !== i))} className="ml-auto text-muted hover:text-danger" aria-label="Remove option"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-2">
              {g.choices.map((c, ci) => (
                <div key={ci} className="flex items-center gap-2">
                  <input value={c.label} onChange={(e) => updateGroup(i, { choices: g.choices.map((x, k) => (k === ci ? { ...x, label: e.target.value } : x)) })} placeholder="Choice" className="field h-9 flex-1" aria-label="Choice label" />
                  <span className="text-sm text-muted">+</span>
                  <input
                    type="number"
                    step="0.01"
                    value={(c.priceDelta / 100).toString()}
                    onChange={(e) => updateGroup(i, { choices: g.choices.map((x, k) => (k === ci ? { ...x, priceDelta: Math.round(Number(e.target.value || 0) * 100) } : x)) })}
                    className="field h-9 w-24"
                    aria-label="Price change"
                  />
                  <button type="button" onClick={() => updateGroup(i, { choices: g.choices.filter((_, k) => k !== ci) })} className="text-muted hover:text-danger" aria-label="Remove choice"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => updateGroup(i, { choices: [...g.choices, { label: "", priceDelta: 0 }] })} className="text-sm font-semibold text-primary">+ Add choice</button>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setGroups((g) => [...g, { name: "", required: false, choices: [{ label: "", priceDelta: 0 }] }])}>
          <Plus className="h-4 w-4" aria-hidden /> Add option
        </Button>
      </Section>

      {type === "PRODUCT" && (
        <Section title="Inventory & fulfilment">
          <Checkbox name="trackInventory" label="Track stock" description="Stock goes down with each order and back up when orders are cancelled." checked={track} onChange={(e) => setTrack(e.target.checked)} />
          {track && (
            <div className="grid gap-4 sm:grid-cols-3">
              {isNew && <Field label="Opening stock" name="openingStock"><Input name="openingStock" type="number" step="0.001" placeholder="0" /></Field>}
              <Field label="Low-stock alert at" name="lowStockThreshold"><Input name="lowStockThreshold" type="number" step="0.001" defaultValue={v.lowStockThreshold} /></Field>
              <Field label="When out of stock" name="availability">
                <Select name="availability" defaultValue={v.availability} options={[{ value: "IN_STOCK", label: "Stop selling" }, { value: "PREORDER", label: "Allow pre-orders" }, { value: "MADE_TO_ORDER", label: "Made to order" }]} />
              </Field>
            </div>
          )}
          {!track && <input type="hidden" name="lowStockThreshold" value={v.lowStockThreshold} />}
          {!track && <input type="hidden" name="availability" value={v.availability} />}
          <Checkbox name="allowBackorder" label="Allow orders beyond stock (backorder)" defaultChecked={v.allowBackorder} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Order notice (days)" name="leadTimeDays"><Input name="leadTimeDays" type="number" min={0} defaultValue={v.leadTimeDays} /></Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <Checkbox name="allowDelivery" label="Can be delivered" defaultChecked={v.allowDelivery} />
            <Checkbox name="allowPickup" label="Can be picked up" defaultChecked={v.allowPickup} />
            <Checkbox name="taxable" label="Taxable" defaultChecked={v.taxable} />
          </div>
        </Section>
      )}
      {type === "SERVICE" && (
        <>
          <input type="hidden" name="lowStockThreshold" value="0" />
          <input type="hidden" name="availability" value="IN_STOCK" />
          <input type="hidden" name="leadTimeDays" value="0" />
          <input type="hidden" name="allowDelivery" value="on" />
          <input type="hidden" name="allowPickup" value="on" />
        </>
      )}

      <Section title="Details & visibility">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" name="status">
            <Select name="status" defaultValue={v.status} options={[{ value: "ACTIVE", label: "Active — visible in shop" }, { value: "DRAFT", label: "Draft — hidden" }, { value: "ARCHIVED", label: "Archived" }]} />
          </Field>
          <Field label="SKU" name="sku" optional><Input name="sku" defaultValue={v.sku} /></Field>
          <Field label="URL slug" name="slug" optional hint="Leave blank to generate from the name."><Input name="slug" defaultValue={v.slug} /></Field>
          <Field label="Tags" name="tags" optional hint="Comma separated, used in search"><Input name="tags" defaultValue={v.tags} /></Field>
          <Field label="Specifications" name="attributes" optional className="sm:col-span-2" hint="One per line, e.g. Breed: Large White">
            <Textarea name="attributes" rows={3} defaultValue={v.attributes} />
          </Field>
        </div>
        <Checkbox name="featured" label="Feature on the home page" defaultChecked={v.featured} />
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <SubmitButton size="lg" pendingText="Saving…">{isNew ? "Create product" : "Save changes"}</SubmitButton>
      </div>
    </Form>
  );
}
