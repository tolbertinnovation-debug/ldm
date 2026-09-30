"use client";

import { ActionButton, Field, Form, Input, SubmitButton } from "@/components/form";
import { changeStaffPasswordAction, confirmTwoFactorAction, disableTwoFactorAction, signOutOthersAction, startTwoFactorAction } from "@/app/admin/security/actions";

export function StartTwoFactor() {
  return <ActionButton action={startTwoFactorAction} variant="primary" size="md">Set up two-factor</ActionButton>;
}
export function ConfirmTwoFactor() {
  return (
    <Form action={confirmTwoFactorAction} refresh className="flex flex-wrap items-end gap-2">
      <Field label="6-digit code from the app" name="code"><Input name="code" inputMode="numeric" maxLength={6} className="w-40 text-center tracking-widest" autoComplete="one-time-code" /></Field>
      <SubmitButton>Turn on</SubmitButton>
    </Form>
  );
}
export function DisableTwoFactor() {
  return (
    <Form action={disableTwoFactorAction} refresh className="flex flex-wrap items-end gap-2">
      <Field label="Current code" name="code"><Input name="code" inputMode="numeric" maxLength={6} className="w-40 text-center" /></Field>
      <SubmitButton variant="outline">Turn off 2FA</SubmitButton>
    </Form>
  );
}
export function StaffPasswordForm() {
  return (
    <Form action={changeStaffPasswordAction} resetOnSuccess className="grid max-w-md gap-3">
      <Field label="Current password" name="current"><Input name="current" type="password" autoComplete="current-password" /></Field>
      <Field label="New password" name="password" hint="At least 8 characters. A short sentence is easy to remember and strong."><Input name="password" type="password" autoComplete="new-password" /></Field>
      <div><SubmitButton>Change password</SubmitButton></div>
    </Form>
  );
}
export function SignOutOthers() {
  return <ActionButton action={signOutOthersAction} variant="outline" size="md" confirm="Sign out on all other phones and computers?">Sign out other devices</ActionButton>;
}
