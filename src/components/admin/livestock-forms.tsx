"use client";

import { useState } from "react";
import { Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { Button } from "@/components/ui";
import { livestockEventAction, saveAnimalAction } from "@/app/admin/livestock/actions";
import { SPECIES, SPECIES_LABELS } from "@/lib/constants";

type Opt = { value: string; label: string };

export function AnimalForm({ products, onDone }: { products: Opt[]; onDone?: () => void }) {
  return (
    <Form action={saveAnimalAction} resetOnSuccess refresh onSuccess={onDone} className="grid gap-3 sm:grid-cols-3">
      <Field label="Tag / ID" name="tag" required><Input name="tag" placeholder="PIG-041 or POND-04" /></Field>
      <Field label="Type" name="species"><Select name="species" defaultValue="PIG" options={SPECIES.map((s) => ({ value: s, label: SPECIES_LABELS[s] }))} /></Field>
      <Field label="Breed" name="breed"><Input name="breed" /></Field>
      <Field label="Sex" name="sex"><Select name="sex" defaultValue="UNKNOWN" options={["MALE", "FEMALE", "MIXED", "UNKNOWN"].map((v) => ({ value: v, label: v.toLowerCase() }))} /></Field>
      <Field label="Head count" name="headCount" hint="More than 1 for fish/poultry batches"><Input name="headCount" type="number" min={1} defaultValue={1} /></Field>
      <Field label="Weight (kg)" name="weightKg"><Input name="weightKg" type="number" step="0.01" /></Field>
      <Field label="Born / stocked" name="birthDate"><Input name="birthDate" type="date" /></Field>
      <Field label="Pen / pond" name="location"><Input name="location" /></Field>
      <Field label="Sells as product" name="productId"><Select name="productId" placeholder="Not linked" options={products} /></Field>
      <Field label="Source" name="source"><Select name="source" defaultValue="BORN_ON_FARM" options={[{ value: "BORN_ON_FARM", label: "Born on farm" }, { value: "PURCHASED", label: "Purchased" }]} /></Field>
      <Field label="Notes" name="notes" className="sm:col-span-2"><Input name="notes" /></Field>
      <div className="sm:col-span-3"><SubmitButton>Register</SubmitButton></div>
    </Form>
  );
}

export function AnimalActions({ id, species, status, products, meatProducts }: { id: string; species: string; status: string; products: Opt[]; meatProducts: Opt[] }) {
  const [mode, setMode] = useState<string | null>(null);
  const fish = species === "FISH";
  const closed = ["SOLD", "SLAUGHTERED", "DECEASED"].includes(status);
  const buttons = closed
    ? [["NOTE", "Note"]]
    : [
        ["WEIGHED", fish ? "Sample weight" : "Weigh"],
        ["VACCINATED", "Vaccinate"],
        ["TREATED", "Treat"],
        ["MOVED", "Move"],
        ...(fish ? [["HARVEST", "Harvest"]] : status === "AVAILABLE" ? [["UNLIST", "Unlist"], ["SOLD", "Mark sold"]] : [["LIST", "List for sale"]]),
        ...(fish ? [] : [["SLAUGHTER", "Slaughter"]]),
        ["DECEASED", fish ? "Loss" : "Died"],
      ];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {buttons.map(([k, label]) => (
          <Button key={k} size="sm" variant={mode === k ? "primary" : "outline"} onClick={() => setMode(mode === k ? null : k!)}>
            {label}
          </Button>
        ))}
      </div>
      {mode && (
        <Form action={livestockEventAction} refresh onSuccess={() => setMode(null)} className="mt-3 grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-3">
          <input type="hidden" name="animalId" value={id} />
          <input type="hidden" name="action" value={mode} />
          {mode === "WEIGHED" && <Field label="Weight (kg)" name="weightKg"><Input name="weightKg" type="number" step="0.01" autoFocus /></Field>}
          {mode === "MOVED" && <Field label="New pen / pond" name="location"><Input name="location" autoFocus /></Field>}
          {mode === "SLAUGHTER" && (
            <>
              <Field label="Meat product" name="productId"><Select name="productId" options={meatProducts} /></Field>
              <Field label="Carcass weight (product unit)" name="quantity"><Input name="quantity" type="number" step="0.1" /></Field>
            </>
          )}
          {mode === "HARVEST" && (
            <>
              <Field label="Into product" name="productId"><Select name="productId" placeholder="Linked product" options={products} /></Field>
              <Field label="Quantity (product unit)" name="quantity"><Input name="quantity" type="number" step="0.1" /></Field>
              <Field label="Fish count" name="count"><Input name="count" type="number" /></Field>
            </>
          )}
          <Field label="Note" name="note" className={mode === "WEIGHED" || mode === "MOVED" ? "sm:col-span-2" : "sm:col-span-3"}><Textarea name="note" rows={1} /></Field>
          <div className="sm:col-span-3"><SubmitButton size="sm">Save</SubmitButton></div>
        </Form>
      )}
    </div>
  );
}
