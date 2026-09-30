"use client";

import { useMemo, useState } from "react";
import { Banknote, Building2, Check, CreditCard, LocateFixed, Lock, MapPin, Smartphone, Store, Truck } from "lucide-react";
import { Checkbox, Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { cn } from "@/components/ui";
import { checkoutAction } from "@/app/(shop)/actions";
import { formatMoney } from "@/lib/money";

type Zone = { id: string; name: string; description: string | null; fee: number; freeOver: number | null; estimatedTime: string | null };
type Pickup = { id: string; name: string; address: string; hours: string | null };
type PaymentOption = { method: string; label: string; description: string; icon: "cash" | "orange" | "momo" | "card" | "bank"; needsReference?: boolean; instructions?: string; number?: string; accountName?: string };

export function CheckoutForm({
  currency,
  pricing,
  zones,
  pickups,
  timeSlots,
  payments,
  defaults,
  deliveryEnabled,
  pickupEnabled,
  allowDelivery,
  allowPickup,
  minDate,
}: {
  currency: string;
  pricing: { subtotal: number; discountTotal: number; taxTotal: number; freeDelivery: boolean };
  zones: Zone[];
  pickups: Pickup[];
  timeSlots: string[];
  payments: PaymentOption[];
  defaults: { name: string; phone: string; email: string; line1: string; area: string; landmark: string; zoneId: string };
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  allowDelivery: boolean;
  allowPickup: boolean;
  minDate: string;
}) {
  const canDeliver = deliveryEnabled && allowDelivery;
  const canPickup = pickupEnabled && allowPickup;
  const [mode, setMode] = useState<"DELIVERY" | "PICKUP">(canDeliver ? "DELIVERY" : "PICKUP");
  const [zoneId, setZoneId] = useState(defaults.zoneId);
  const [method, setMethod] = useState(payments[0]?.method ?? "CASH");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const zone = zones.find((z) => z.id === zoneId);
  const deliveryFee = useMemo(() => {
    if (mode !== "DELIVERY" || !zone || pricing.freeDelivery) return 0;
    if (zone.freeOver !== null && pricing.subtotal >= zone.freeOver) return 0;
    return zone.fee;
  }, [mode, zone, pricing]);
  const total = pricing.subtotal - pricing.discountTotal + deliveryFee + pricing.taxTotal;
  const selectedPayment = payments.find((p) => p.method === method);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <Form action={checkoutAction} className="space-y-6">
      {/* Honeypot for bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <Section n={1} title="Your details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" name="name" required>
            <Input name="name" defaultValue={defaults.name} autoComplete="name" required />
          </Field>
          <Field label="Phone (WhatsApp preferred)" name="phone" required hint="We'll send order updates here.">
            <Input name="phone" type="tel" inputMode="tel" defaultValue={defaults.phone} placeholder="077 123 4567" autoComplete="tel" required />
          </Field>
          <Field label="Email" name="email" optional className="sm:col-span-2">
            <Input name="email" type="email" defaultValue={defaults.email} autoComplete="email" />
          </Field>
        </div>
      </Section>

      <Section n={2} title="Delivery or pickup">
        <input type="hidden" name="fulfillmentType" value={mode} />
        <div className="grid grid-cols-2 gap-3">
          <ModeCard active={mode === "DELIVERY"} disabled={!canDeliver} onClick={() => setMode("DELIVERY")} icon={<Truck className="h-5 w-5" />} title="Delivery" text={canDeliver ? "To your door" : "Not available for these items"} />
          <ModeCard active={mode === "PICKUP"} disabled={!canPickup} onClick={() => setMode("PICKUP")} icon={<Store className="h-5 w-5" />} title="Pickup" text={canPickup ? "Free, at the farm" : "Not available"} />
        </div>

        {mode === "DELIVERY" ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Delivery area" name="deliveryZoneId" required className="sm:col-span-2">
              <Select
                name="deliveryZoneId"
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                placeholder="Choose your area…"
                options={zones.map((z) => ({
                  value: z.id,
                  label: `${z.name} — ${z.fee ? formatMoney(z.fee, currency) : "Free"}${z.estimatedTime ? ` · ${z.estimatedTime}` : ""}`,
                }))}
              />
            </Field>
            {zone && (
              <p className="-mt-2 text-[13px] text-muted sm:col-span-2">
                Covers {zone.description}. {zone.freeOver !== null && <>Free delivery on orders over {formatMoney(zone.freeOver, currency)}.</>}
              </p>
            )}
            <Field label="Street / house" name="line1" required className="sm:col-span-2">
              <Input name="line1" defaultValue={defaults.line1} placeholder="e.g. 12 Duport Road, blue gate" autoComplete="street-address" />
            </Field>
            <Field label="Community / area" name="area">
              <Input name="area" defaultValue={defaults.area} placeholder="e.g. ELWA Junction" />
            </Field>
            <Field label="Nearest landmark" name="landmark" hint="Helps our driver find you">
              <Input name="landmark" defaultValue={defaults.landmark} placeholder="e.g. opposite Total station" />
            </Field>
            <input type="hidden" name="city" value="Monrovia" />
            <div className="sm:col-span-2">
              <button type="button" onClick={locate} className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium hover:bg-surface-2">
                <LocateFixed className="h-4 w-4" aria-hidden />
                {locating ? "Getting location…" : coords ? "Location pinned ✓" : "Pin my exact location (optional)"}
              </button>
              {coords && (
                <>
                  <input type="hidden" name="lat" value={coords.lat} />
                  <input type="hidden" name="lng" value={coords.lng} />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {pickups.map((p, i) => (
              <label key={p.id} className="flex cursor-pointer gap-3 rounded-xl border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40">
                <input type="radio" name="pickupLocationId" value={p.id} defaultChecked={i === 0} className="mt-1 accent-[var(--primary)]" />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden /> {p.name}
                  </span>
                  <span className="block text-sm text-muted">{p.address}</span>
                  {p.hours && <span className="block text-sm text-muted">{p.hours}</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={mode === "DELIVERY" ? "Delivery date" : "Pickup date"} name="scheduledDate" optional>
            <Input name="scheduledDate" type="date" min={minDate} />
          </Field>
          <Field label="Time" name="timeSlot" optional>
            <Select name="timeSlot" placeholder="Any time" options={timeSlots.map((t) => ({ value: t, label: t }))} />
          </Field>
        </div>
      </Section>

      <Section n={3} title="Payment">
        <input type="hidden" name="paymentMethod" value={method} />
        <div className="grid gap-3">
          {payments.map((p) => (
            <button
              type="button"
              key={p.method}
              onClick={() => setMethod(p.method)}
              aria-pressed={method === p.method}
              className={cn("flex items-center gap-3 rounded-xl border p-4 text-left transition", method === p.method ? "border-primary bg-primary-soft/50 ring-2 ring-primary/15" : "border-border hover:border-border-strong")}
            >
              <PaymentIcon kind={p.icon} />
              <span className="flex-1">
                <span className="block font-semibold">{p.label}</span>
                <span className="block text-sm text-muted">{p.description}</span>
              </span>
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border", method === p.method ? "border-primary bg-primary text-primary-fg" : "border-border-strong")}>
                {method === p.method && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
        {selectedPayment?.needsReference && (
          <div className="mt-4 space-y-3 rounded-xl bg-surface-2 p-4 text-sm">
            <p className="font-semibold">
              Send {formatMoney(total, currency)} to {selectedPayment.number} ({selectedPayment.accountName})
            </p>
            <p className="text-muted">{selectedPayment.instructions}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Transaction ID" name="momoReference" hint="You can also add this later from your order page.">
                <Input name="momoReference" placeholder="e.g. MP2609.1234.A12345" />
              </Field>
              <Field label="Number you paid from" name="payerPhone">
                <Input name="payerPhone" type="tel" placeholder="077 123 4567" />
              </Field>
            </div>
          </div>
        )}
        {selectedPayment?.icon === "momo" && !selectedPayment.needsReference && (
          <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
            <Field label="MTN number to charge" name="payerPhone" hint="You'll get a prompt on your phone to approve the payment.">
              <Input name="payerPhone" type="tel" placeholder="088 123 4567" />
            </Field>
          </div>
        )}
      </Section>

      <Section n={4} title="Anything else?">
        <Field label="Note for our team" name="customerNote" optional>
          <Textarea name="customerNote" placeholder="e.g. Please cut the pig into 8 pieces. Call when you reach the junction." />
        </Field>
        <Checkbox name="marketingOptIn" label="Send me weekly specials" description="Occasional offers on WhatsApp/SMS. Reply STOP anytime." className="mt-4" />
      </Section>

      <div className="card sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-4 p-4 md:static">
        <div>
          <p className="text-xs text-muted">{mode === "DELIVERY" ? `Incl. ${deliveryFee ? formatMoney(deliveryFee, currency) : "free"} delivery` : "Pickup — no delivery fee"}</p>
          <p className="tabular text-xl font-bold">{formatMoney(total, currency)}</p>
        </div>
        <SubmitButton size="lg" pendingText="Placing order…">
          <Lock className="h-4 w-4" aria-hidden /> Place order
        </SubmitButton>
      </div>
    </Form>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2.5 text-lg font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-sm font-bold text-primary-fg">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ModeCard({ active, disabled, onClick, icon, title, text }: { active: boolean; disabled: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50", active ? "border-primary bg-primary-soft/50 ring-2 ring-primary/15" : "border-border hover:border-border-strong")}
    >
      <span className={active ? "text-primary" : "text-muted"}>{icon}</span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs text-muted">{text}</span>
    </button>
  );
}

function PaymentIcon({ kind }: { kind: PaymentOption["icon"] }) {
  const map = {
    cash: { icon: Banknote, bg: "bg-success-soft text-success-fg" },
    orange: { icon: Smartphone, bg: "bg-[#ff7900]/15 text-[#c85d00]" },
    momo: { icon: Smartphone, bg: "bg-[#ffcc00]/25 text-[#8a6d00]" },
    card: { icon: CreditCard, bg: "bg-info-soft text-info-fg" },
    bank: { icon: Building2, bg: "bg-surface-3 text-fg" },
  }[kind];
  const Icon = map.icon;
  return (
    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", map.bg)}>
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}
