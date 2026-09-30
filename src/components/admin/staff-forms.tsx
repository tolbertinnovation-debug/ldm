"use client";

import { ActionButton, Checkbox, Field, Form, Input, Select, SubmitButton } from "@/components/form";
import { createStaffAction, resetTwoFactorAction, updateStaffAction } from "@/app/admin/staff/actions";
import { ROLE_META, STAFF_ROLES } from "@/lib/auth/permissions";

const roleOptions = STAFF_ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }));

export function NewStaffForm() {
  return (
    <Form action={createStaffAction} resetOnSuccess refresh className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <Field label="Name" name="name"><Input name="name" /></Field>
      <Field label="Email (login)" name="email"><Input name="email" type="email" /></Field>
      <Field label="Phone" name="phone"><Input name="phone" type="tel" /></Field>
      <Field label="Role" name="role"><Select name="role" defaultValue="SALES" options={roleOptions} /></Field>
      <Field label="Temporary password" name="password"><Input name="password" type="text" autoComplete="new-password" /></Field>
      <div className="lg:col-span-5"><SubmitButton>Add staff member</SubmitButton></div>
    </Form>
  );
}

export function StaffRowForm({ u, self }: { u: { id: string; role: string; active: boolean; totpEnabled: boolean }; self: boolean }) {
  return (
    <div className="space-y-2">
      <Form action={updateStaffAction} refresh className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={u.id} />
        <Select name="role" defaultValue={u.role} options={[...roleOptions, { value: "CUSTOMER", label: "Remove staff access" }]} className="h-9 w-44 text-sm" disabled={self} />
        {self && <input type="hidden" name="role" value={u.role} />}
        <Input name="newPassword" placeholder="New password" className="h-9 w-36 text-sm" autoComplete="new-password" />
        <Checkbox name="active" label="Active" defaultChecked={u.active} disabled={self} />
        {self && <input type="hidden" name="active" value="on" />}
        <SubmitButton size="sm" variant="outline">Save</SubmitButton>
      </Form>
      {u.totpEnabled && !self && <ActionButton action={resetTwoFactorAction} fields={{ id: u.id }} variant="ghost" confirm="Reset this person's two-factor authentication?">Reset 2FA</ActionButton>}
    </div>
  );
}
