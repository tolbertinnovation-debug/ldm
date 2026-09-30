"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { bookServiceAction } from "@/app/(shop)/actions";

export function BookingForm({ serviceId, perPerson, defaults, minDate }: { serviceId: string; perPerson: boolean; defaults: { name: string; phone: string; email: string }; minDate: string }) {
  const [done, setDone] = useState<string | null>(null);
  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden />
        <p className="text-lg font-semibold">Booking request sent</p>
        <p className="max-w-sm text-sm text-muted">{done}</p>
      </div>
    );
  }
  return (
    <Form action={bookServiceAction} onSuccess={(s) => setDone(s.message ?? "We will contact you shortly.")} toastOnSuccess={false} className="space-y-4">
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="name" required>
          <Input name="name" defaultValue={defaults.name} autoComplete="name" />
        </Field>
        <Field label="Phone" name="phone" required>
          <Input name="phone" type="tel" defaultValue={defaults.phone} placeholder="077 123 4567" />
        </Field>
        <Field label="Email" name="email" optional className="sm:col-span-2">
          <Input name="email" type="email" defaultValue={defaults.email} />
        </Field>
        <Field label="Preferred date" name="preferredDate" optional>
          <Input name="preferredDate" type="date" min={minDate} />
        </Field>
        <Field label="Preferred time" name="preferredTime" optional>
          <Select name="preferredTime" placeholder="Any time" options={["Morning", "Afternoon"].map((v) => ({ value: v, label: v }))} />
        </Field>
        {perPerson && (
          <Field label="Number of people" name="participants">
            <Input name="participants" type="number" min={1} max={500} defaultValue={1} />
          </Field>
        )}
        <Field label="Location / community" name="location" optional className={perPerson ? "" : "sm:col-span-2"}>
          <Input name="location" placeholder="Where are you based?" />
        </Field>
        <Field label="Details" name="details" optional className="sm:col-span-2">
          <Textarea name="details" placeholder="Tell us what you need — number of pigs, group name, farm size…" />
        </Field>
      </div>
      <SubmitButton size="lg" className="w-full" pendingText="Sending…">
        Request booking
      </SubmitButton>
      <p className="text-center text-xs text-muted">No payment now. We&apos;ll call to confirm the date and price.</p>
    </Form>
  );
}
