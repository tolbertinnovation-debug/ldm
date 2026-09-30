"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { Button } from "@/components/ui";
import { createInvoiceManualAction } from "@/app/admin/invoices/actions";
import { formatMoney, lineTotal, parseMoney } from "@/lib/money";

type Line = { description: string; quantity: number; unit: string; unitPrice: string };

export function InvoiceEditor({ customers, products, currency, defaults }: { customers: { value: string; label: string }[]; products: { name: string; price: string; unit: string }[]; currency: string; defaults: { issueDate: string; dueDate: string; notes: string; terms: string } }) {
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unit: "", unitPrice: "" }]);
  const [discount, setDiscount] = useState("");
  const subtotal = useMemo(() => lines.reduce((a, l) => a + lineTotal(parseMoney(l.unitPrice) ?? 0, l.quantity || 0), 0), [lines]);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Form action={createInvoiceManualAction} className="space-y-6">
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.description))} />
      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Customer" name="customerId" required className="sm:col-span-3"><Select name="customerId" placeholder="Choose customer…" options={customers} /></Field>
        <Field label="Issue date" name="issueDate"><Input name="issueDate" type="date" defaultValue={defaults.issueDate} /></Field>
        <Field label="Due date" name="dueDate"><Input name="dueDate" type="date" defaultValue={defaults.dueDate} /></Field>
      </div>
      <div className="card p-5">
        <datalist id="product-names">{products.map((p) => <option key={p.name} value={p.name} />)}</datalist>
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_90px_90px_110px_110px_auto] sm:items-center">
              <input list="product-names" value={l.description} onChange={(e) => { const p = products.find((x) => x.name === e.target.value); set(i, { description: e.target.value, ...(p ? { unitPrice: p.price, unit: p.unit } : {}) }); }} placeholder="Description" className="field" aria-label="Description" />
              <input type="number" step="0.001" value={l.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value) })} className="field" aria-label="Quantity" />
              <input value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} placeholder="unit" className="field" aria-label="Unit" />
              <input value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} placeholder="Price" inputMode="decimal" className="field" aria-label="Unit price" />
              <span className="tabular text-right text-sm font-semibold">{formatMoney(lineTotal(parseMoney(l.unitPrice) ?? 0, l.quantity || 0), currency)}</span>
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setLines((ls) => [...ls, { description: "", quantity: 1, unit: "", unitPrice: "" }])}><Plus className="h-4 w-4" aria-hidden /> Add line</Button>
        <div className="ml-auto mt-4 max-w-xs space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular font-semibold">{formatMoney(subtotal, currency)}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="text-muted">Discount</span><Input name="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0.00" className="h-8 w-28 text-right" /></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>Total (before tax)</span><span className="tabular">{formatMoney(subtotal - (parseMoney(discount) ?? 0), currency)}</span></div>
        </div>
      </div>
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Notes" name="notes"><Textarea name="notes" defaultValue={defaults.notes} /></Field>
        <Field label="Terms" name="terms"><Textarea name="terms" defaultValue={defaults.terms} /></Field>
      </div>
      <SubmitButton size="lg">Create invoice</SubmitButton>
    </Form>
  );
}
