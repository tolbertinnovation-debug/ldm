"use client";

import { useState } from "react";
import { Check, MessageSquare, Scale, X } from "lucide-react";
import { ActionButton, Checkbox, Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { Button, cn } from "@/components/ui";
import {
  addNoteAction,
  assignDriverAction,
  messageCustomerAction,
  recordPaymentAction,
  setStatusAction,
  setWeightAction,
  settlePaymentAction,
  updateInternalNoteAction,
} from "@/app/admin/orders/actions";
import { ORDER_STATUS_META, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type OrderStatus } from "@/lib/constants";

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Confirm order",
  PROCESSING: "Start preparing",
  READY: "Mark ready",
  OUT_FOR_DELIVERY: "Send out for delivery",
  COMPLETED: "Mark completed",
};

export function StatusActions({ orderId, transitions, fulfillment }: { orderId: string; transitions: OrderStatus[]; fulfillment: "DELIVERY" | "PICKUP" }) {
  const [cancelling, setCancelling] = useState(false);
  const forward = transitions.filter((s) => s !== "CANCELLED");
  if (!transitions.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {forward.map((s, i) => (
          <ActionButton key={s} action={setStatusAction} fields={{ orderId, status: s }} variant={i === 0 ? "primary" : "outline"} size="md">
            {s === "COMPLETED" ? (fulfillment === "DELIVERY" ? "Mark delivered" : "Mark picked up") : s === "READY" && fulfillment === "PICKUP" ? "Ready for pickup" : NEXT_LABEL[s] ?? ORDER_STATUS_META[s].label}
          </ActionButton>
        ))}
        {transitions.includes("CANCELLED") && !cancelling && (
          <Button variant="ghost" onClick={() => setCancelling(true)} className="text-danger">
            Cancel order
          </Button>
        )}
      </div>
      {cancelling && (
        <Form action={setStatusAction} className="space-y-3 rounded-xl bg-danger-soft/60 p-4">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="status" value="CANCELLED" />
          <Field label="Reason for cancelling" name="reason" required>
            <Input name="reason" placeholder="e.g. Customer changed mind" />
          </Field>
          <Checkbox name="notify" label="Notify the customer" defaultChecked />
          <div className="flex gap-2">
            <SubmitButton variant="danger">Cancel order & restock</SubmitButton>
            <Button variant="ghost" onClick={() => setCancelling(false)}>Keep order</Button>
          </div>
        </Form>
      )}
    </div>
  );
}

export function PaymentForm({ orderId, invoiceId, due, defaultMethod, allowRefund }: { orderId?: string; invoiceId?: string; due: string; defaultMethod?: string | null; allowRefund?: boolean }) {
  const [kind, setKind] = useState<"PAYMENT" | "REFUND">("PAYMENT");
  return (
    <Form action={recordPaymentAction} resetOnSuccess className="space-y-3">
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      {invoiceId && <input type="hidden" name="invoiceId" value={invoiceId} />}
      <input type="hidden" name="kind" value={kind} />
      {allowRefund && (
        <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
          {(["PAYMENT", "REFUND"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-md px-3 py-1", kind === k ? "bg-surface shadow-card" : "text-muted")}>
              {k === "PAYMENT" ? "Payment" : "Refund"}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" name="amount">
          <Input name="amount" inputMode="decimal" defaultValue={kind === "PAYMENT" ? due : ""} placeholder="0.00" />
        </Field>
        <Field label="Method" name="method">
          <Select name="method" defaultValue={defaultMethod ?? "CASH"} options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
        </Field>
      </div>
      <Field label="Transaction ID / reference" name="reference" optional>
        <Input name="reference" placeholder="Mobile money or bank reference" />
      </Field>
      <SubmitButton variant={kind === "REFUND" ? "danger" : "primary"} className="w-full">
        {kind === "REFUND" ? "Record refund" : "Record payment"}
      </SubmitButton>
    </Form>
  );
}

export function SettleButtons({ paymentId }: { paymentId: string }) {
  return (
    <div className="flex gap-1.5">
      <ActionButton action={settlePaymentAction} fields={{ paymentId, outcome: "SUCCEEDED" }} variant="primary" size="sm">
        <Check className="h-3.5 w-3.5" aria-hidden /> Confirm
      </ActionButton>
      <ActionButton action={settlePaymentAction} fields={{ paymentId, outcome: "FAILED" }} variant="outline" size="sm" confirm="Reject this payment? The customer will still owe the balance.">
        <X className="h-3.5 w-3.5" aria-hidden /> Reject
      </ActionButton>
    </div>
  );
}

export function WeightEditor({ orderId, itemId, quantity, unit }: { orderId: string; itemId: string; quantity: number; unit: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
        <Scale className="h-3.5 w-3.5" aria-hidden /> Set actual weight
      </button>
    );
  return (
    <Form action={setWeightAction} onSuccess={() => setOpen(false)} className="mt-1 flex items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Input name="quantity" type="number" step="0.001" min="0.001" defaultValue={quantity} className="h-8 w-24 text-sm" autoFocus />
      <span className="text-xs text-muted">{unit}</span>
      <SubmitButton size="sm">Save</SubmitButton>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">Cancel</button>
    </Form>
  );
}

export function DriverSelect({ orderId, drivers, current }: { orderId: string; drivers: { id: string; name: string }[]; current: string | null }) {
  return (
    <Form action={assignDriverAction} className="flex gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <Select name="driverId" defaultValue={current ?? ""} placeholder="Unassigned" options={drivers.map((d) => ({ value: d.id, label: d.name }))} className="h-9" />
      <SubmitButton size="sm" variant="outline">Assign</SubmitButton>
    </Form>
  );
}

export function NoteForm({ orderId }: { orderId: string }) {
  return (
    <Form action={addNoteAction} resetOnSuccess className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <Textarea name="message" rows={2} placeholder="Add a note to the timeline…" />
      <div className="flex items-center justify-between">
        <Checkbox name="isPublic" label="Visible to customer" />
        <SubmitButton size="sm" variant="secondary">Add note</SubmitButton>
      </div>
    </Form>
  );
}

export function ScheduleForm({ orderId, internalNote, scheduledDate, timeSlot, slots }: { orderId: string; internalNote: string; scheduledDate: string; timeSlot: string; slots: string[] }) {
  return (
    <Form action={updateInternalNoteAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" name="scheduledDate"><Input name="scheduledDate" type="date" defaultValue={scheduledDate} /></Field>
        <Field label="Time" name="timeSlot"><Select name="timeSlot" defaultValue={timeSlot} placeholder="Any time" options={slots.map((s) => ({ value: s, label: s }))} /></Field>
      </div>
      <Field label="Internal note (staff only)" name="internalNote"><Textarea name="internalNote" rows={2} defaultValue={internalNote} /></Field>
      <SubmitButton size="sm" variant="outline">Save</SubmitButton>
    </Form>
  );
}

export function MessageForm({ customerId, orderId, phone, email, templates }: { customerId?: string | null; orderId?: string; phone?: string | null; email?: string | null; templates?: { label: string; body: string }[] }) {
  const [channel, setChannel] = useState<"WHATSAPP" | "SMS" | "EMAIL">(phone ? "WHATSAPP" : "EMAIL");
  const [body, setBody] = useState("");
  const to = channel === "EMAIL" ? email ?? "" : phone ?? "";
  return (
    <Form action={messageCustomerAction} resetOnSuccess onSuccess={() => setBody("")} className="space-y-3">
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="to" value={to} />
      <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
        {(["WHATSAPP", "SMS", "EMAIL"] as const).map((c) => (
          <button key={c} type="button" disabled={c === "EMAIL" ? !email : !phone} onClick={() => setChannel(c)} className={cn("flex-1 rounded-md py-1.5 disabled:opacity-40", channel === c ? "bg-surface shadow-card" : "text-muted")}>
            {c === "WHATSAPP" ? "WhatsApp" : c === "SMS" ? "SMS" : "Email"}
          </button>
        ))}
      </div>
      {channel === "EMAIL" && <Input name="subject" placeholder="Subject" />}
      {templates && templates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <button key={t.label} type="button" onClick={() => setBody(t.body)} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-surface-3">
              {t.label}
            </button>
          ))}
        </div>
      )}
      <Textarea name="body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Message to ${to || "customer"}…`} />
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{channel !== "EMAIL" && `${body.length} chars · ${Math.max(1, Math.ceil(body.length / 153))} SMS`}</span>
        <SubmitButton size="sm" disabled={!to}>
          <MessageSquare className="h-4 w-4" aria-hidden /> Send
        </SubmitButton>
      </div>
    </Form>
  );
}
