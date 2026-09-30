"use client";

import { Trash2 } from "lucide-react";
import { ActionButton, Checkbox, Field, Form, Input, Select, SubmitButton } from "@/components/form";
import { addAddressAction, changePasswordAction, deleteAddressAction, reorderAction, updateProfileAction } from "@/app/(shop)/account/actions";

export function ProfileForm({ d }: { d: { name: string; email: string; preferredChannel: string; marketingWhatsapp: boolean; marketingSms: boolean; marketingEmail: boolean } }) {
  return (
    <Form action={updateProfileAction} refresh className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name"><Input name="name" defaultValue={d.name} /></Field>
        <Field label="Email" name="email" optional><Input name="email" type="email" defaultValue={d.email} /></Field>
        <Field label="Send order updates by" name="preferredChannel" className="sm:col-span-2">
          <Select name="preferredChannel" defaultValue={d.preferredChannel} options={[{ value: "WHATSAPP", label: "WhatsApp" }, { value: "SMS", label: "SMS" }, { value: "EMAIL", label: "Email" }]} />
        </Field>
      </div>
      <fieldset className="space-y-2.5 rounded-xl bg-surface-2 p-4">
        <legend className="px-1 text-sm font-semibold">Offers & news</legend>
        <Checkbox name="marketingWhatsapp" label="WhatsApp" defaultChecked={d.marketingWhatsapp} />
        <Checkbox name="marketingSms" label="SMS" defaultChecked={d.marketingSms} />
        <Checkbox name="marketingEmail" label="Email" defaultChecked={d.marketingEmail} />
      </fieldset>
      <SubmitButton>Save profile</SubmitButton>
    </Form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  return (
    <Form action={changePasswordAction} resetOnSuccess className="space-y-4">
      {hasPassword && <Field label="Current password" name="current"><Input name="current" type="password" autoComplete="current-password" /></Field>}
      <Field label={hasPassword ? "New password" : "Set a password"} name="password" hint="Optional — you can always sign in with a phone code."><Input name="password" type="password" autoComplete="new-password" /></Field>
      <SubmitButton variant="outline">{hasPassword ? "Change password" : "Set password"}</SubmitButton>
    </Form>
  );
}

export function AddressForm({ zones }: { zones: { value: string; label: string }[] }) {
  return (
    <Form action={addAddressAction} refresh resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <Field label="Label" name="label"><Input name="label" placeholder="Home, Shop…" /></Field>
      <Field label="Delivery area" name="zoneId"><Select name="zoneId" placeholder="Choose…" options={zones} /></Field>
      <Field label="Street / house" name="line1" className="sm:col-span-2"><Input name="line1" /></Field>
      <Field label="Community" name="area"><Input name="area" /></Field>
      <Field label="Landmark" name="landmark"><Input name="landmark" /></Field>
      <div className="sm:col-span-2"><SubmitButton variant="outline">Save address</SubmitButton></div>
    </Form>
  );
}

export function DeleteAddress({ id }: { id: string }) {
  return (
    <ActionButton action={deleteAddressAction} fields={{ id }} variant="ghost" confirm="Remove this address?">
      <Trash2 className="h-4 w-4" aria-hidden /> <span className="sr-only">Remove</span>
    </ActionButton>
  );
}

export function ReorderButton({ orderId }: { orderId: string }) {
  return (
    <ActionButton action={reorderAction} fields={{ orderId }} variant="outline">
      Reorder
    </ActionButton>
  );
}
