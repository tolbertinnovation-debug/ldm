"use client";

import { useActionState, useState, startTransition } from "react";
import { Users } from "lucide-react";
import { Checkbox, Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { Button, cn } from "@/components/ui";
import { previewAudienceAction, saveBroadcastAction, saveTemplateAction } from "@/app/admin/messages/actions";
import { CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES } from "@/lib/constants";
import { smsSegments } from "@/lib/messaging/templates";

export function TemplateForm({ t }: { t: { key: string; name: string; description: string | null; subject: string | null; body: string; active: boolean } }) {
  return (
    <Form action={saveTemplateAction} className="space-y-2">
      <input type="hidden" name="key" value={t.key} />
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-semibold">{t.name}</p><p className="text-xs text-muted">{t.description}</p></div>
        <Checkbox name="active" label="On" defaultChecked={t.active} />
      </div>
      <Input name="subject" defaultValue={t.subject ?? ""} placeholder="Email subject" className="text-sm" />
      <Textarea name="body" defaultValue={t.body} rows={3} className="text-sm" />
      <SubmitButton size="sm" variant="outline">Save</SubmitButton>
    </Form>
  );
}

export function BroadcastComposer({ categories, campaigns }: { categories: { value: string; label: string }[]; campaigns: { value: string; label: string }[] }) {
  const [channel, setChannel] = useState<"WHATSAPP" | "SMS" | "EMAIL">("WHATSAPP");
  const [when, setWhen] = useState<"now" | "later" | "draft">("draft");
  const [body, setBody] = useState("Hi {{firstName}}! ");
  const [preview, previewAction, previewing] = useActionState(previewAudienceAction, { ok: false });
  const seg = smsSegments(body + "\nReply STOP to opt out.");

  function refreshCount(form: HTMLFormElement | null) {
    if (!form) return;
    const fd = new FormData(form);
    startTransition(() => previewAction(fd));
  }

  return (
    <Form action={saveBroadcastAction} resetOnSuccess refresh className="space-y-5">
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="when" value={when} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Broadcast name" name="name" required><Input name="name" placeholder="e.g. Weekend pork special" /></Field>
        <Field label="Linked campaign" name="campaignId" optional><Select name="campaignId" placeholder="None" options={campaigns} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
        {(["WHATSAPP", "SMS", "EMAIL"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setChannel(c)} className={cn("rounded-lg py-2", channel === c ? "bg-surface shadow-card" : "text-muted")}>{c === "WHATSAPP" ? "WhatsApp" : c === "SMS" ? "SMS" : "Email"}</button>
        ))}
      </div>
      <fieldset className="space-y-3 rounded-xl border border-border p-4" onChange={(e) => refreshCount((e.currentTarget as HTMLFieldSetElement).form)}>
        <legend className="px-1 text-sm font-semibold">Audience (only opted-in customers)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {CUSTOMER_TYPES.map((t) => <Checkbox key={t} name="types" value={t} label={CUSTOMER_TYPE_LABELS[t]} />)}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Ordered in last (days)" name="orderedWithinDays"><Input name="orderedWithinDays" type="number" min={1} /></Field>
          <Field label="Not ordered in (days)" name="notOrderedWithinDays"><Input name="notOrderedWithinDays" type="number" min={1} /></Field>
          <Field label="Spent at least" name="minTotalSpent"><Input name="minTotalSpent" type="number" min={0} step="0.01" /></Field>
          <Field label="Bought from category" name="productCategoryId"><Select name="productCategoryId" placeholder="Any" options={categories} /></Field>
          <Field label="Has tags" name="tags" className="sm:col-span-2"><Input name="tags" placeholder="vip, wholesale" /></Field>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="secondary" onClick={(e) => refreshCount((e.currentTarget as HTMLButtonElement).form)}><Users className="h-4 w-4" aria-hidden /> Count recipients</Button>
          <span className="text-sm">{previewing ? "Counting…" : preview.data ? <strong>{String(preview.data.count)} customers will receive this</strong> : <span className="text-muted">Change filters to update the count</span>}</span>
        </div>
      </fieldset>
      {channel === "EMAIL" && <Field label="Subject" name="subject" required><Input name="subject" /></Field>}
      <Field label="Message" name="body" required hint={channel === "EMAIL" ? "Use {{firstName}} and {{shopUrl}}." : `${seg.segments} SMS segment(s) · ${seg.encoding} · "Reply STOP to opt out" is added automatically.`}>
        <Textarea name="body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="space-y-3 rounded-xl bg-surface-2 p-4">
        <div className="flex flex-wrap gap-4 text-sm">
          {([["draft", "Save as draft"], ["now", "Send now"], ["later", "Schedule"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="radio" checked={when === k} onChange={() => setWhen(k)} className="accent-[var(--primary)]" /> {l}</label>
          ))}
        </div>
        {when === "later" && <Field label="Send at" name="scheduledAt"><Input name="scheduledAt" type="datetime-local" /></Field>}
        {channel === "WHATSAPP" && <p className="text-xs text-muted">WhatsApp only allows free-form messages within 24h of the customer&apos;s last message. For cold outreach, use approved templates in Meta, or send by SMS.</p>}
        <SubmitButton pendingText="Saving…">{when === "now" ? "Send broadcast" : when === "later" ? "Schedule broadcast" : "Save draft"}</SubmitButton>
      </div>
    </Form>
  );
}
