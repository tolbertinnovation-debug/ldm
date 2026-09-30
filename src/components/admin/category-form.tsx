"use client";

import { Field, Form, Input, Select, SubmitButton, Checkbox } from "@/components/form";
import { saveCategoryAction } from "@/app/admin/products/actions";

const ICONS = ["piggy", "beef", "ham", "fish", "leaf", "wheat", "graduation"].map((v) => ({ value: v, label: v }));

export function CategoryForm({ c }: { c?: { id: string; name: string; description: string | null; icon: string | null; sortOrder: number; active: boolean } }) {
  return (
    <Form action={saveCategoryAction} resetOnSuccess={!c} refresh className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_80px_auto] sm:items-end">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label={c ? undefined : "Name"} name="name"><Input name="name" defaultValue={c?.name} placeholder="Category name" /></Field>
      <Field label={c ? undefined : "Description"} name="description"><Input name="description" defaultValue={c?.description ?? ""} placeholder="Description" /></Field>
      <Field label={c ? undefined : "Icon"} name="icon"><Select name="icon" defaultValue={c?.icon ?? "leaf"} options={ICONS} /></Field>
      <Field label={c ? undefined : "Order"} name="sortOrder"><Input name="sortOrder" type="number" defaultValue={c?.sortOrder ?? 0} /></Field>
      <div className="flex items-center gap-3 pb-1">
        <Checkbox name="active" label="Active" defaultChecked={c?.active ?? true} />
        <SubmitButton size="sm" variant={c ? "outline" : "primary"}>{c ? "Save" : "Add"}</SubmitButton>
      </div>
    </Form>
  );
}
