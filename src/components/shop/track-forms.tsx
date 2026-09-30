"use client";

import { useState } from "react";
import { Field, Form, Input, SubmitButton } from "@/components/form";
import { cn } from "@/components/ui";
import { payOrderAction, trackLookupAction } from "@/app/(shop)/actions";

export function TrackLookupForm() {
  return (
    <Form action={trackLookupAction} className="space-y-4">
      <Field label="Order number" name="number" required>
        <Input name="number" placeholder="e.g. REAP-10245" autoCapitalize="characters" />
      </Field>
      <Field label="Phone number used for the order" name="phone" required>
        <Input name="phone" type="tel" inputMode="tel" placeholder="077 123 4567" />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Finding your order…">
        Track order
      </SubmitButton>
    </Form>
  );
}

type Method = { method: "ORANGE_MONEY" | "MTN_MOMO" | "CARD"; label: string; number?: string; instructions?: string; automatic?: boolean };

export function PayForm({ token, due, methods }: { token: string; due: string; methods: Method[] }) {
  const [method, setMethod] = useState<Method["method"]>(methods[0]!.method);
  const selected = methods.find((m) => m.method === method)!;
  return (
    <Form action={payOrderAction} refresh className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="method" value={method} />
      <div className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <button key={m.method} type="button" onClick={() => setMethod(m.method)} className={cn("rounded-xl border px-3.5 py-2 text-sm font-medium", method === m.method ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border-strong")}>
            {m.label}
          </button>
        ))}
      </div>
      {selected.method !== "CARD" && !selected.automatic && (
        <>
          <p className="text-sm text-muted">
            Send <strong className="text-fg">{due}</strong> to <strong className="text-fg">{selected.number}</strong>. {selected.instructions}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Transaction ID" name="reference" required>
              <Input name="reference" placeholder="From your confirmation SMS" />
            </Field>
            <Field label="Paid from number" name="payerPhone">
              <Input name="payerPhone" type="tel" />
            </Field>
          </div>
        </>
      )}
      {selected.automatic && (
        <Field label="MTN number" name="payerPhone" hint="You'll receive a prompt to approve the payment.">
          <Input name="payerPhone" type="tel" />
        </Field>
      )}
      <SubmitButton pendingText="Submitting…">{selected.method === "CARD" ? `Pay ${due} by card` : selected.automatic ? `Send payment prompt` : "Submit payment"}</SubmitButton>
    </Form>
  );
}
