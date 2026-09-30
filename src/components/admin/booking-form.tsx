"use client";

import { ActionButton, Checkbox, Form, Input, Select, SubmitButton } from "@/components/form";
import { invoiceBookingAction, updateBookingAction } from "@/app/admin/bookings/actions";

export function BookingControls({ b, canInvoice }: { b: { id: string; status: string; preferredDate: string | null; preferredTime: string | null; quotedAmount: string; internalNote: string }; canInvoice: boolean }) {
  return (
    <div className="space-y-2">
      <Form action={updateBookingAction} className="grid gap-2 sm:grid-cols-[140px_140px_110px_1fr_auto] sm:items-center">
        <input type="hidden" name="id" value={b.id} />
        <Select name="status" defaultValue={b.status} options={["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"].map((s) => ({ value: s, label: s.toLowerCase() }))} className="h-9 text-sm" />
        <Input name="scheduledDate" type="date" defaultValue={b.preferredDate ?? ""} className="h-9 text-sm" aria-label="Date" />
        <Input name="quotedAmount" defaultValue={b.quotedAmount} placeholder="Quote" inputMode="decimal" className="h-9 text-sm" aria-label="Quoted amount" />
        <Input name="internalNote" defaultValue={b.internalNote} placeholder="Internal note" className="h-9 text-sm" />
        <div className="flex items-center gap-2">
          <Checkbox name="notify" label="Notify" defaultChecked />
          <SubmitButton size="sm">Save</SubmitButton>
        </div>
      </Form>
      {canInvoice && b.quotedAmount && <ActionButton action={invoiceBookingAction} fields={{ id: b.id }} variant="ghost">Create invoice</ActionButton>}
    </div>
  );
}
