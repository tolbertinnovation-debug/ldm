"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Smartphone } from "lucide-react";
import { Checkbox, Field, Form, Input, SubmitButton } from "@/components/form";
import { cn } from "@/components/ui";
import { loginAction, registerAction, requestCodeAction, verifyCodeAction, verifyTwoFactorAction } from "@/app/(auth)/actions";

export function LoginForms({ next }: { next: string }) {
  const [mode, setMode] = useState<"code" | "password">("code");
  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
        {(
          [
            ["code", "Phone code", Smartphone],
            ["password", "Password", KeyRound],
          ] as const
        ).map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => setMode(key)} className={cn("flex items-center justify-center gap-2 rounded-lg py-2 transition", mode === key ? "bg-surface text-fg shadow-card" : "text-muted")}>
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {mode === "code" ? (
        <Form action={requestCodeAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Phone number" name="phone" hint="We'll send a 6-digit code by WhatsApp or SMS.">
            <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="077 123 4567" autoFocus />
          </Field>
          <SubmitButton size="lg" className="w-full" pendingText="Sending code…">Send me a code</SubmitButton>
        </Form>
      ) : (
        <Form action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Email or phone" name="identifier">
            <Input name="identifier" autoComplete="username" placeholder="you@example.com or 077…" autoFocus />
          </Field>
          <Field label="Password" name="password">
            <Input name="password" type="password" autoComplete="current-password" />
          </Field>
          <SubmitButton size="lg" className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
          <p className="text-center text-xs text-muted">Staff members sign in here with their password.</p>
        </Form>
      )}
    </div>
  );
}

export function VerifyCodeForm({ phone, next }: { phone: string; next: string }) {
  return (
    <Form action={verifyCodeAction} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next} />
      <Field label="6-digit code" name="code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} placeholder="••••••" className="text-center text-2xl tracking-[0.5em]" autoFocus />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Verifying…">Verify & continue</SubmitButton>
      <p className="text-center text-sm text-muted">
        Didn&apos;t get it? <Link href={`/login?next=${encodeURIComponent(next)}`} className="link">Send a new code</Link>
      </p>
    </Form>
  );
}

export function TwoFactorForm() {
  return (
    <Form action={verifyTwoFactorAction} className="space-y-4">
      <Field label="Authenticator code" name="code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className="text-center text-2xl tracking-[0.4em]" autoFocus />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Verifying…">Verify</SubmitButton>
    </Form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  return (
    <Form action={registerAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Full name" name="name" required>
        <Input name="name" autoComplete="name" autoFocus />
      </Field>
      <Field label="Phone number" name="phone" required>
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="077 123 4567" />
      </Field>
      <Field label="Email" name="email" optional>
        <Input name="email" type="email" autoComplete="email" />
      </Field>
      <Field label="Password" name="password" required hint="At least 8 characters.">
        <Input name="password" type="password" autoComplete="new-password" />
      </Field>
      <Checkbox name="marketing" label="Send me farm specials and new products" description="On WhatsApp/SMS. Unsubscribe anytime." />
      <SubmitButton size="lg" className="w-full" pendingText="Creating account…">Create account</SubmitButton>
    </Form>
  );
}
