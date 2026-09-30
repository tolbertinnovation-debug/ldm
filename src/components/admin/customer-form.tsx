"use client";

import { Checkbox, Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { saveCustomerAction } from "@/app/admin/customers/actions";
import { CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES } from "@/lib/constants";

export type CustomerValues = { id?: string; name: string; phone: string; email: string; type: string; companyName: string; tags: string; notes: string; source: string; preferredChannel: string; discountPercent: number; marketingWhatsapp: boolean; marketingSms: boolean; marketingEmail: boolean };

export function CustomerForm({ v, readOnly }: { v: CustomerValues; readOnly?: boolean }) {
  return (
    <Form action={saveCustomerAction} className="space-y-4">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" required><Input name="name" defaultValue={v.name} /></Field>
        <Field label="Type" name="type"><Select name="type" defaultValue={v.type} options={CUSTOMER_TYPES.map((t) => ({ value: t, label: CUSTOMER_TYPE_LABELS[t] }))} /></Field>
        <Field label="Phone" name="phone"><Input name="phone" type="tel" defaultValue={v.phone} /></Field>
        <Field label="Email" name="email"><Input name="email" type="email" defaultValue={v.email} /></Field>
        <Field label="Business name" name="companyName" optional><Input name="companyName" defaultValue={v.companyName} /></Field>
        <Field label="How they found us" name="source" optional><Input name="source" defaultValue={v.source} placeholder="Radio, Facebook, referral…" /></Field>
        <Field label="Tags" name="tags" optional hint="Comma separated, e.g. vip, wholesale"><Input name="tags" defaultValue={v.tags} /></Field>
        <Field label="Standing discount %" name="discountPercent" hint="Applied automatically to every order"><Input name="discountPercent" type="number" min={0} max={50} defaultValue={v.discountPercent} /></Field>
        <Field label="Preferred channel" name="preferredChannel"><Select name="preferredChannel" defaultValue={v.preferredChannel} options={[{ value: "WHATSAPP", label: "WhatsApp" }, { value: "SMS", label: "SMS" }, { value: "EMAIL", label: "Email" }]} /></Field>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">Marketing consent</p>
          <div className="flex flex-wrap gap-5">
            <Checkbox name="marketingWhatsapp" label="WhatsApp" defaultChecked={v.marketingWhatsapp} />
            <Checkbox name="marketingSms" label="SMS" defaultChecked={v.marketingSms} />
            <Checkbox name="marketingEmail" label="Email" defaultChecked={v.marketingEmail} />
          </div>
          <p className="text-xs text-muted">Only tick these if the customer agreed to receive offers.</p>
        </div>
        <Field label="Notes" name="notes" optional className="sm:col-span-2"><Textarea name="notes" rows={3} defaultValue={v.notes} /></Field>
      </fieldset>
      {!readOnly && <SubmitButton>{v.id ? "Save customer" : "Create customer"}</SubmitButton>}
    </Form>
  );
}
