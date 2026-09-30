"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LocateFixed, XCircle } from "lucide-react";
import { ActionButton, Field, Form, Input, Select, SubmitButton } from "@/components/form";
import { Button, cn } from "@/components/ui";
import { claimDeliveryAction, driverUpdateAction } from "@/app/driver/actions";

export function LocationSharer({ active }: { active: boolean }) {
  const [on, setOn] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  useEffect(() => {
    if (!on || !active || !navigator.geolocation) return;
    let lastSent = 0;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastSent < 30_000) return;
        lastSent = Date.now();
        fetch("/api/driver/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) })
          .then(() => setLast(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })))
          .catch(() => {});
      },
      () => setOn(false),
      { enableHighAccuracy: true, maximumAge: 20_000 },
    );
    return () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    };
  }, [on, active]);
  if (!active) return null;
  return (
    <button type="button" onClick={() => setOn(!on)} className={cn("flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold", on ? "bg-primary text-primary-fg" : "bg-surface-2 text-fg")}>
      <LocateFixed className={cn("h-4 w-4", on && "animate-pulse")} aria-hidden />
      {on ? `Sharing live location${last ? ` · sent ${last}` : "…"}` : "Share my live location with customers"}
    </button>
  );
}

export function DeliverySteps({ orderId, status, due }: { orderId: string; status: string; due: string }) {
  const [mode, setMode] = useState<"done" | "fail" | null>(null);
  if (status === "ASSIGNED" || status === "UNASSIGNED") {
    return (
      <ActionButton action={driverUpdateAction} fields={{ orderId, step: "PICKED_UP" }} variant="primary" size="lg" className="w-full">
        Picked up — start delivery
      </ActionButton>
    );
  }
  return (
    <div className="space-y-3">
      {!mode && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => setMode("done")}><CheckCircle2 className="h-5 w-5" aria-hidden /> Delivered</Button>
          <Button size="lg" variant="outline" onClick={() => setMode("fail")}><XCircle className="h-5 w-5" aria-hidden /> Problem</Button>
        </div>
      )}
      {mode === "done" && (
        <Form action={driverUpdateAction} className="space-y-3 rounded-xl bg-success-soft/60 p-3">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="step" value="DELIVERED" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount collected" name="cashCollected"><Input name="cashCollected" inputMode="decimal" defaultValue={due} /></Field>
            <Field label="Paid by" name="paymentMethod"><Select name="paymentMethod" defaultValue="CASH" options={[{ value: "CASH", label: "Cash" }, { value: "ORANGE_MONEY", label: "Orange Money" }, { value: "MTN_MOMO", label: "MTN MoMo" }]} /></Field>
          </div>
          <Field label="Received by" name="recipientName"><Input name="recipientName" placeholder="Name of person" /></Field>
          <Field label="Note" name="note"><Input name="note" /></Field>
          <div className="flex gap-2"><SubmitButton size="lg" className="flex-1">Confirm delivered</SubmitButton><Button variant="ghost" onClick={() => setMode(null)}>Back</Button></div>
        </Form>
      )}
      {mode === "fail" && (
        <Form action={driverUpdateAction} className="space-y-3 rounded-xl bg-danger-soft/60 p-3">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="step" value="FAILED" />
          <Field label="What happened?" name="note"><Select name="note" options={["Customer not reachable", "Customer not at address", "Customer refused order", "Wrong address", "Vehicle problem"].map((v) => ({ value: v, label: v }))} /></Field>
          <div className="flex gap-2"><SubmitButton variant="danger" className="flex-1">Report problem</SubmitButton><Button variant="ghost" onClick={() => setMode(null)}>Back</Button></div>
        </Form>
      )}
    </div>
  );
}

export function ClaimButton({ orderId }: { orderId: string }) {
  return <ActionButton action={claimDeliveryAction} fields={{ orderId }} variant="outline">Take this delivery</ActionButton>;
}
