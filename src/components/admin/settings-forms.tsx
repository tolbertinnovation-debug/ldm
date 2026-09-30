"use client";

import { Checkbox, Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { saveBusinessAction, saveCommerceAction, saveNotificationsAction, savePaymentsAction, savePickupAction, saveZoneAction } from "@/app/admin/settings/actions";
import type { StoreSettings } from "@/lib/settings";

export function BusinessForm({ b }: { b: StoreSettings["business"] }) {
  return (
    <Form action={saveBusinessAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Business name" name="name" required><Input name="name" defaultValue={b.name} /></Field>
      <Field label="Legal / organisation name" name="legalName"><Input name="legalName" defaultValue={b.legalName} /></Field>
      <Field label="Tagline" name="tagline" className="sm:col-span-2"><Input name="tagline" defaultValue={b.tagline} /></Field>
      <Field label="About" name="about" className="sm:col-span-2"><Textarea name="about" defaultValue={b.about} rows={3} /></Field>
      <Field label="Phone" name="phone"><Input name="phone" defaultValue={b.phone} /></Field>
      <Field label="WhatsApp number" name="whatsapp" hint="International format, e.g. +231770000000"><Input name="whatsapp" defaultValue={b.whatsapp} /></Field>
      <Field label="Email" name="email"><Input name="email" defaultValue={b.email} /></Field>
      <Field label="Opening hours" name="hours"><Input name="hours" defaultValue={b.hours} /></Field>
      <Field label="Address" name="address"><Input name="address" defaultValue={b.address} /></Field>
      <Field label="City / county" name="city"><Input name="city" defaultValue={b.city} /></Field>
      <Field label="Country" name="country"><Input name="country" defaultValue={b.country} /></Field>
      <Field label="Website" name="website"><Input name="website" defaultValue={b.website} /></Field>
      {(["facebook", "instagram", "tiktok", "x", "youtube"] as const).map((k) => (
        <Field key={k} label={`${k[0]!.toUpperCase()}${k.slice(1)} URL`} name={`social.${k}`}><Input name={`social.${k}`} defaultValue={b.social[k]} placeholder="https://" /></Field>
      ))}
      <div className="sm:col-span-2"><SubmitButton>Save business profile</SubmitButton></div>
    </Form>
  );
}

export function CommerceForm({ c }: { c: StoreSettings["commerce"] }) {
  return (
    <Form action={saveCommerceAction} className="grid gap-4 sm:grid-cols-3">
      <Field label="Currency" name="currency" hint="ISO code, e.g. USD"><Input name="currency" defaultValue={c.currency} maxLength={3} className="uppercase" /></Field>
      <Field label="Second currency" name="secondaryCurrency" hint="Shown as ≈ price, e.g. LRD"><Input name="secondaryCurrency" defaultValue={c.secondaryCurrency} maxLength={3} className="uppercase" /></Field>
      <Field label="Exchange rate" name="exchangeRate" hint={`1 ${c.currency} = ? ${c.secondaryCurrency}`}><Input name="exchangeRate" type="number" step="0.01" defaultValue={c.exchangeRate} /></Field>
      <Field label="Tax rate %" name="taxRate"><Input name="taxRate" type="number" step="0.01" defaultValue={c.taxRate} /></Field>
      <Field label="Tax label" name="taxLabel"><Input name="taxLabel" defaultValue={c.taxLabel} /></Field>
      <Field label="Order number prefix" name="orderPrefix"><Input name="orderPrefix" defaultValue={c.orderPrefix} className="uppercase" /></Field>
      <Field label="Minimum online order" name="minOrderAmount"><Input name="minOrderAmount" inputMode="decimal" defaultValue={(c.minOrderAmount / 100).toFixed(2)} /></Field>
      <Field label="Delivery time slots" name="timeSlots" hint="One per line" className="sm:col-span-2"><Textarea name="timeSlots" defaultValue={c.timeSlots.join("\n")} rows={3} /></Field>
      <Field label="Announcement bar" name="announcement" className="sm:col-span-3" hint="Shown at the top of the shop, e.g. holiday hours"><Input name="announcement" defaultValue={c.announcement} /></Field>
      <div className="flex flex-wrap gap-5 sm:col-span-3">
        <Checkbox name="showSecondaryPrices" label="Show second-currency prices" defaultChecked={c.showSecondaryPrices} />
        <Checkbox name="deliveryEnabled" label="Delivery available" defaultChecked={c.deliveryEnabled} />
        <Checkbox name="pickupEnabled" label="Pickup available" defaultChecked={c.pickupEnabled} />
        <Checkbox name="allowGuestCheckout" label="Allow guest checkout" defaultChecked={c.allowGuestCheckout} />
      </div>
      <div className="sm:col-span-3"><SubmitButton>Save store settings</SubmitButton></div>
    </Form>
  );
}

export function PaymentsForm({ p, cardAvailable, momoApi }: { p: StoreSettings["payments"]; cardAvailable: boolean; momoApi: boolean }) {
  return (
    <Form action={savePaymentsAction} className="space-y-5">
      <div className="flex flex-wrap gap-5">
        <Checkbox name="cashOnDelivery" label="Cash on delivery" defaultChecked={p.cashOnDelivery} />
        <Checkbox name="payAtPickup" label="Pay at pickup" defaultChecked={p.payAtPickup} />
      </div>
      <fieldset className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-3">
        <div className="sm:col-span-3"><Checkbox name="om.enabled" label="Orange Money" description="Customer sends money to your merchant number and enters the transaction ID; staff verify." defaultChecked={p.orangeMoney.enabled} /></div>
        <Field label="Number" name="om.number"><Input name="om.number" defaultValue={p.orangeMoney.number} /></Field>
        <Field label="Account name" name="om.accountName"><Input name="om.accountName" defaultValue={p.orangeMoney.accountName} /></Field>
        <Field label="Instructions" name="om.instructions" className="sm:col-span-3"><Input name="om.instructions" defaultValue={p.orangeMoney.instructions} /></Field>
      </fieldset>
      <fieldset className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-3">
        <div className="sm:col-span-3"><Checkbox name="momo.enabled" label="MTN Mobile Money" description={momoApi ? "MoMo API connected: customers get an automatic payment prompt." : "Manual transfer with transaction ID (connect the MoMo API for automatic prompts)."} defaultChecked={p.mtnMomo.enabled} /></div>
        <Field label="Number" name="momo.number"><Input name="momo.number" defaultValue={p.mtnMomo.number} /></Field>
        <Field label="Account name" name="momo.accountName"><Input name="momo.accountName" defaultValue={p.mtnMomo.accountName} /></Field>
        <Field label="Instructions" name="momo.instructions" className="sm:col-span-3"><Input name="momo.instructions" defaultValue={p.mtnMomo.instructions} /></Field>
      </fieldset>
      <fieldset className="space-y-3 rounded-xl border border-border p-4">
        <Checkbox name="bank.enabled" label="Bank transfer" defaultChecked={p.bankTransfer.enabled} />
        <Field label="Bank details" name="bank.details"><Textarea name="bank.details" defaultValue={p.bankTransfer.details} rows={3} placeholder="Bank, account name, account number, branch" /></Field>
      </fieldset>
      <Checkbox name="card.enabled" label="Card payments (Flutterwave)" description={cardAvailable ? "Flutterwave key detected." : "Add FLUTTERWAVE_SECRET_KEY to enable."} defaultChecked={p.card.enabled} />
      <SubmitButton>Save payment options</SubmitButton>
    </Form>
  );
}

export function NotificationsForm({ n, inv }: { n: StoreSettings["notifications"]; inv: StoreSettings["invoice"] }) {
  return (
    <Form action={saveNotificationsAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Alert phone (WhatsApp/SMS)" name="adminPhone" hint="Gets new order & low-stock alerts"><Input name="adminPhone" defaultValue={n.adminPhone} /></Field>
      <Field label="Alert email" name="adminEmail"><Input name="adminEmail" defaultValue={n.adminEmail} /></Field>
      <Field label="Default channel for customers" name="defaultChannel"><Select name="defaultChannel" defaultValue={n.defaultChannel} options={[{ value: "WHATSAPP", label: "WhatsApp" }, { value: "SMS", label: "SMS" }, { value: "EMAIL", label: "Email" }]} /></Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Checkbox name="customerOrderUpdates" label="Send customers order updates automatically" defaultChecked={n.customerOrderUpdates} />
        <Checkbox name="notifyNewOrder" label="Alert staff about new online orders" defaultChecked={n.notifyNewOrder} />
        <Checkbox name="notifyNewBooking" label="Alert staff about new bookings" defaultChecked={n.notifyNewBooking} />
        <Checkbox name="notifyLowStock" label="Alert staff when stock runs low" defaultChecked={n.notifyLowStock} />
      </div>
      <Field label="Invoice due after (days)" name="dueDays"><Input name="dueDays" type="number" defaultValue={inv.dueDays} /></Field>
      <div />
      <Field label="Invoice terms" name="terms"><Textarea name="terms" defaultValue={inv.terms} /></Field>
      <Field label="Invoice note" name="notes"><Textarea name="notes" defaultValue={inv.notes} /></Field>
      <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>
    </Form>
  );
}

export function ZoneForm({ z }: { z?: { id: string; name: string; description: string | null; fee: string; freeOver: string; estimatedTime: string | null; sortOrder: number; active: boolean } }) {
  return (
    <Form action={saveZoneAction} resetOnSuccess={!z} refresh className="grid gap-2 sm:grid-cols-[1.2fr_1.5fr_90px_100px_120px_60px_auto] sm:items-center">
      {z && <input type="hidden" name="id" value={z.id} />}
      <Input name="name" defaultValue={z?.name} placeholder="Area name" aria-label="Area name" className="h-9 text-sm" />
      <Input name="description" defaultValue={z?.description ?? ""} placeholder="Communities covered" aria-label="Communities" className="h-9 text-sm" />
      <Input name="fee" defaultValue={z?.fee} placeholder="Fee" inputMode="decimal" aria-label="Fee" className="h-9 text-sm" />
      <Input name="freeOver" defaultValue={z?.freeOver} placeholder="Free over" inputMode="decimal" aria-label="Free over" className="h-9 text-sm" />
      <Input name="estimatedTime" defaultValue={z?.estimatedTime ?? ""} placeholder="Same day" aria-label="Estimated time" className="h-9 text-sm" />
      <Input name="sortOrder" type="number" defaultValue={z?.sortOrder ?? 0} aria-label="Order" className="h-9 text-sm" />
      <div className="flex items-center gap-2"><Checkbox name="active" label="On" defaultChecked={z?.active ?? true} /><SubmitButton size="sm" variant={z ? "outline" : "primary"}>{z ? "Save" : "Add"}</SubmitButton></div>
    </Form>
  );
}

export function PickupForm({ l }: { l?: { id: string; name: string; address: string; hours: string | null; phone: string | null; instructions: string | null; lat: number | null; lng: number | null; active: boolean } }) {
  return (
    <Form action={savePickupAction} resetOnSuccess={!l} refresh className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-3">
      {l && <input type="hidden" name="id" value={l.id} />}
      <Field label="Name" name="name"><Input name="name" defaultValue={l?.name} /></Field>
      <Field label="Address" name="address" className="sm:col-span-2"><Input name="address" defaultValue={l?.address} /></Field>
      <Field label="Hours" name="hours"><Input name="hours" defaultValue={l?.hours ?? ""} /></Field>
      <Field label="Phone" name="phone"><Input name="phone" defaultValue={l?.phone ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Lat" name="lat"><Input name="lat" defaultValue={l?.lat ?? ""} /></Field><Field label="Lng" name="lng"><Input name="lng" defaultValue={l?.lng ?? ""} /></Field></div>
      <Field label="Instructions" name="instructions" className="sm:col-span-2"><Input name="instructions" defaultValue={l?.instructions ?? ""} /></Field>
      <div className="flex items-center gap-3"><Checkbox name="active" label="Active" defaultChecked={l?.active ?? true} /><SubmitButton size="sm" variant={l ? "outline" : "primary"}>{l ? "Save" : "Add location"}</SubmitButton></div>
    </Form>
  );
}
