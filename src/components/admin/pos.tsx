"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Search, Trash2, UserRound } from "lucide-react";
import { Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { cn } from "@/components/ui";
import { createPosOrderAction } from "@/app/admin/orders/actions";
import { centsToInput, formatMoney, lineTotal } from "@/lib/money";
import { ORDER_CHANNEL_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, UNIT_LABELS, type SalesUnit } from "@/lib/constants";
import type { ProductOptionGroup } from "@/lib/db/schema";

type P = { id: string; name: string; price: number; unit: string; stockQty: number; trackInventory: boolean; minQty: number; qtyStep: number; options: ProductOptionGroup[]; category: string | null };
type C = { id: string; name: string; phone: string | null; email: string | null; discountPercent: number };
type Line = { key: string; product: P; quantity: number; options: { group: string; choice: string; priceDelta: number }[] };

export function PosScreen({ products, customers, zones, pickups, currency, slots }: { products: P[]; customers: C[]; zones: { id: string; name: string; fee: number }[]; pickups: { id: string; name: string }[]; currency: string; slots: string[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [cq, setCq] = useState("");
  const [customer, setCustomer] = useState<C | null>(null);
  const [mode, setMode] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [zoneId, setZoneId] = useState("");
  const [status, setStatus] = useState<"PENDING" | "CONFIRMED" | "COMPLETED">("CONFIRMED");

  const cats = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[], [products]);
  const shown = products.filter((p) => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 60);
  const matches = cq.length >= 2 ? customers.filter((c) => c.name.toLowerCase().includes(cq.toLowerCase()) || (c.phone ?? "").includes(cq.replace(/\D/g, "") || "@@")).slice(0, 6) : [];

  const subtotal = lines.reduce((a, l) => a + lineTotal(l.product.price + l.options.reduce((s, o) => s + o.priceDelta, 0), l.quantity), 0);
  const discount = customer?.discountPercent ? Math.round((subtotal * customer.discountPercent) / 100) : 0;
  const zone = zones.find((z) => z.id === zoneId);
  const [feeOverride, setFeeOverride] = useState<string>("");
  const fee = mode === "DELIVERY" ? (feeOverride !== "" ? Math.round(Number(feeOverride) * 100) || 0 : zone?.fee ?? 0) : 0;
  const total = subtotal - discount + fee;

  function add(p: P) {
    const options = p.options.filter((g) => g.required).map((g) => ({ group: g.name, choice: g.choices[0]!.label, priceDelta: g.choices[0]!.priceDelta }));
    const key = p.id + JSON.stringify(options);
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, quantity: Math.round((l.quantity + p.qtyStep) * 1000) / 1000 } : l));
      return [...prev, { key, product: p, quantity: p.minQty, options }];
    });
  }
  function setQty(key: string, qty: number) {
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity: Math.round(qty * 1000) / 1000 } : l))));
  }
  function setOption(key: string, group: ProductOptionGroup, label: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const others = l.options.filter((o) => o.group !== group.name);
        const choice = group.choices.find((c) => c.label === label);
        return { ...l, options: choice ? [...others, { group: group.name, choice: choice.label, priceDelta: choice.priceDelta }] : others };
      }),
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
      <div className="card p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="field h-11 pl-9" autoFocus />
        </div>
        <div className="scrollbar-none mt-3 flex gap-1.5 overflow-x-auto">
          {["", ...cats].map((c) => (
            <button key={c || "all"} type="button" onClick={() => setCat(c)} className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold", cat === c ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted")}>
              {c || "All"}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => (
            <button key={p.id} type="button" onClick={() => add(p)} className="flex flex-col rounded-xl border border-border p-3 text-left transition hover:border-primary hover:bg-primary-soft/30 active:scale-[0.98]">
              <span className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</span>
              <span className="mt-auto pt-2 text-sm"><span className="tabular font-bold">{formatMoney(p.price, currency)}</span><span className="text-xs text-muted">/{UNIT_LABELS[p.unit as SalesUnit]?.short}</span></span>
              {p.trackInventory && <span className={cn("text-[11px]", p.stockQty <= 0 ? "text-danger" : "text-subtle")}>{p.stockQty} in stock</span>}
            </button>
          ))}
        </div>
      </div>

      <Form action={createPosOrderAction} className="space-y-4">
        <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, options: l.options.map((o) => ({ group: o.group, choice: o.choice })) })))} />
        <div className="card p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" aria-hidden /> Customer</h2>
          {customer ? (
            <div className="flex items-center justify-between rounded-xl bg-primary-soft/50 px-3 py-2.5 text-sm">
              <span><span className="font-semibold">{customer.name}</span><span className="block text-muted">{customer.phone}{customer.discountPercent ? ` · ${customer.discountPercent}% account discount` : ""}</span></span>
              <button type="button" onClick={() => setCustomer(null)} className="text-xs font-semibold text-muted hover:text-fg">Change</button>
            </div>
          ) : (
            <div className="relative">
              <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Find existing customer by name or phone…" className="field" />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lift">
                  {matches.map((c) => (
                    <li key={c.id}><button type="button" onClick={() => { setCustomer(c); setCq(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"><span className="font-medium">{c.name}</span> <span className="text-muted">{c.phone}</span></button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <input type="hidden" name="customerId" value={customer?.id ?? ""} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Name" name="name"><Input name="name" key={customer?.id ?? "new"} defaultValue={customer?.name ?? ""} readOnly={!!customer} /></Field>
            <Field label="Phone" name="phone"><Input name="phone" key={(customer?.id ?? "new") + "p"} type="tel" defaultValue={customer?.phone ?? ""} readOnly={!!customer} /></Field>
          </div>
          <input type="hidden" name="email" value={customer?.email ?? ""} />
          <div className="mt-3">
            <Field label="Order came in via" name="channel">
              <Select name="channel" defaultValue="WHATSAPP" options={(["WHATSAPP", "PHONE", "WALK_IN", "SOCIAL", "WHOLESALE", "OTHER"] as const).map((c) => ({ value: c, label: ORDER_CHANNEL_LABELS[c] }))} />
            </Field>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">Items</h2>
          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Tap products to add them.</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((l) => {
                const unitPrice = l.product.price + l.options.reduce((s, o) => s + o.priceDelta, 0);
                return (
                  <li key={l.key} className="rounded-xl bg-surface-2 p-3">
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <span className="font-semibold">{l.product.name}</span>
                      <span className="tabular font-semibold">{formatMoney(lineTotal(unitPrice, l.quantity), currency)}</span>
                    </div>
                    {l.product.options.map((g) => (
                      <select key={g.name} value={l.options.find((o) => o.group === g.name)?.choice ?? ""} onChange={(e) => setOption(l.key, g, e.target.value)} className="field mt-2 h-8 text-xs">
                        {!g.required && <option value="">{g.name}: none</option>}
                        {g.choices.map((c) => <option key={c.label} value={c.label}>{g.name}: {c.label}{c.priceDelta ? ` (+${formatMoney(c.priceDelta, currency)})` : ""}</option>)}
                      </select>
                    ))}
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => setQty(l.key, l.quantity - l.product.qtyStep)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface" aria-label="Less"><Minus className="h-3.5 w-3.5" /></button>
                      <input type="number" step="0.001" value={l.quantity} onChange={(e) => setQty(l.key, Number(e.target.value))} className="field h-8 w-20 text-center text-sm" aria-label="Quantity" />
                      <button type="button" onClick={() => setQty(l.key, l.quantity + l.product.qtyStep)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface" aria-label="More"><Plus className="h-3.5 w-3.5" /></button>
                      <span className="text-xs text-muted">{UNIT_LABELS[l.product.unit as SalesUnit]?.short} × {formatMoney(unitPrice, currency)}</span>
                      <button type="button" onClick={() => setQty(l.key, 0)} className="ml-auto text-muted hover:text-danger" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card space-y-3 p-4 sm:p-5">
          <input type="hidden" name="fulfillmentType" value={mode} />
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
            {(["PICKUP", "DELIVERY"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn("rounded-lg py-2", mode === m ? "bg-surface shadow-card" : "text-muted")}>{m === "PICKUP" ? "Pickup / walk-in" : "Delivery"}</button>
            ))}
          </div>
          {mode === "DELIVERY" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zone" name="deliveryZoneId"><Select name="deliveryZoneId" value={zoneId} onChange={(e) => setZoneId(e.target.value)} placeholder="Choose…" options={zones.map((z) => ({ value: z.id, label: `${z.name} (${formatMoney(z.fee, currency)})` }))} /></Field>
              <Field label="Fee override" name="deliveryFee"><Input name="deliveryFee" inputMode="decimal" placeholder={zone ? centsToInput(zone.fee) : "0.00"} value={feeOverride} onChange={(e) => setFeeOverride(e.target.value)} /></Field>
              <Field label="Address" name="line1" className="col-span-2"><Input name="line1" /></Field>
              <Field label="Area" name="area"><Input name="area" /></Field>
              <Field label="Landmark" name="landmark"><Input name="landmark" /></Field>
            </div>
          ) : (
            <Field label="Pickup location" name="pickupLocationId"><Select name="pickupLocationId" options={pickups.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" name="scheduledDate"><Input name="scheduledDate" type="date" /></Field>
            <Field label="Time" name="timeSlot"><Select name="timeSlot" placeholder="Any" options={slots.map((s) => ({ value: s, label: s }))} /></Field>
          </div>
          <Field label="Promo code" name="promoCode" optional><Input name="promoCode" className="uppercase" /></Field>
          <Field label="Internal note" name="internalNote" optional><Textarea name="internalNote" rows={2} /></Field>
        </div>

        <div className="card space-y-3 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment method" name="paymentMethod"><Select name="paymentMethod" defaultValue="CASH" options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} /></Field>
            <Field label="Amount paid now" name="amountPaid"><Input name="amountPaid" inputMode="decimal" placeholder="0.00" /></Field>
          </div>
          <Field label="Transaction ID" name="paymentRef" optional><Input name="paymentRef" /></Field>
          <input type="hidden" name="status" value={status} />
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 text-xs font-semibold">
            {([["PENDING", "Save as pending"], ["CONFIRMED", "Confirm"], ["COMPLETED", "Sold & handed over"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} className={cn("rounded-lg px-1 py-2", status === k ? "bg-surface shadow-card" : "text-muted")}>{label}</button>
            ))}
          </div>
          <dl className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular">{formatMoney(subtotal, currency)}</dd></div>
            {discount > 0 && <div className="flex justify-between text-success-fg"><dt>Account discount</dt><dd className="tabular">−{formatMoney(discount, currency)}</dd></div>}
            {mode === "DELIVERY" && <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular">{formatMoney(fee, currency)}</dd></div>}
            <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd className="tabular">{formatMoney(total, currency)}</dd></div>
          </dl>
          <SubmitButton size="lg" className="w-full" disabled={!lines.length} pendingText="Creating order…">Create order</SubmitButton>
          <p className="text-center text-xs text-muted">Promo codes and taxes are applied when the order is saved.</p>
        </div>
      </Form>
    </div>
  );
}
