"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Checkbox, Field, Form, Input, Select, SubmitButton, Textarea } from "@/components/form";
import { cn } from "@/components/ui";
import { toast } from "@/components/toaster";
import { saveCampaignAction, saveMetricAction, savePromotionAction, saveSocialPostAction } from "@/app/admin/campaigns/actions";
import { CAMPAIGN_CHANNEL_LABELS, CAMPAIGN_CHANNELS, SOCIAL_PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/constants";

type Opt = { value: string; label: string };

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <button type="button" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold hover:bg-surface-3">
      <Copy className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );
}

export function CampaignForm({ v }: { v: { id?: string; name: string; channel: string; objective: string; status: string; startDate: string; endDate: string; budget: string; utmCampaign: string; landingPath: string; targetAudience: string; notes: string } }) {
  return (
    <Form action={saveCampaignAction} className="grid gap-4 sm:grid-cols-2">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Field label="Campaign name" name="name" required><Input name="name" defaultValue={v.name} /></Field>
      <Field label="Channel" name="channel"><Select name="channel" defaultValue={v.channel} options={CAMPAIGN_CHANNELS.map((c) => ({ value: c, label: CAMPAIGN_CHANNEL_LABELS[c] }))} /></Field>
      <Field label="Objective" name="objective" className="sm:col-span-2"><Input name="objective" defaultValue={v.objective} placeholder="e.g. Sell 30 whole pigs for Christmas" /></Field>
      <Field label="Status" name="status"><Select name="status" defaultValue={v.status} options={["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"].map((s) => ({ value: s, label: s.toLowerCase() }))} /></Field>
      <Field label="Budget" name="budget"><Input name="budget" inputMode="decimal" defaultValue={v.budget} /></Field>
      <Field label="Start" name="startDate"><Input name="startDate" type="date" defaultValue={v.startDate} /></Field>
      <Field label="End" name="endDate"><Input name="endDate" type="date" defaultValue={v.endDate} /></Field>
      <Field label="Tracking code (utm_campaign)" name="utmCampaign" hint="Auto-generated from the name if blank"><Input name="utmCampaign" defaultValue={v.utmCampaign} /></Field>
      <Field label="Landing page" name="landingPath" hint="Where ad links should go, e.g. /shop/category/pork-cuts"><Input name="landingPath" defaultValue={v.landingPath} /></Field>
      <Field label="Target audience" name="targetAudience" className="sm:col-span-2"><Input name="targetAudience" defaultValue={v.targetAudience} /></Field>
      <Field label="Notes" name="notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={v.notes} /></Field>
      <div className="sm:col-span-2"><SubmitButton>{v.id ? "Save campaign" : "Create campaign"}</SubmitButton></div>
    </Form>
  );
}

export function MetricForm({ campaignId, today }: { campaignId: string; today: string }) {
  return (
    <Form action={saveMetricAction} refresh className="grid gap-3 sm:grid-cols-6 sm:items-end">
      <input type="hidden" name="campaignId" value={campaignId} />
      <Field label="Date" name="date"><Input name="date" type="date" defaultValue={today} /></Field>
      <Field label="Spend" name="spend"><Input name="spend" inputMode="decimal" /></Field>
      <Field label="Impressions / reach" name="impressions"><Input name="impressions" type="number" /></Field>
      <Field label="Clicks" name="clicks"><Input name="clicks" type="number" /></Field>
      <Field label="Leads / calls" name="leads"><Input name="leads" type="number" /></Field>
      <SubmitButton variant="outline">Save day</SubmitButton>
    </Form>
  );
}

export function PromotionForm({ categories, products, campaigns }: { categories: Opt[]; products: Opt[]; campaigns: Opt[] }) {
  const [type, setType] = useState("PERCENT");
  const [scope, setScope] = useState("ALL");
  const targets = scope === "CATEGORIES" ? categories : scope === "PRODUCTS" ? products : [];
  return (
    <Form action={savePromotionAction} resetOnSuccess refresh className="grid gap-4 sm:grid-cols-3">
      <Field label="Name" name="name" required><Input name="name" placeholder="Christmas pork deal" /></Field>
      <Field label="Code" name="code" required><Input name="code" placeholder="XMAS10" className="uppercase" /></Field>
      <Field label="Type" name="type"><Select name="type" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: "PERCENT", label: "% off" }, { value: "FIXED", label: "Amount off" }, { value: "FREE_DELIVERY", label: "Free delivery" }]} /></Field>
      {type !== "FREE_DELIVERY" && <Field label={type === "PERCENT" ? "Percent" : "Amount"} name="value"><Input name="value" inputMode="decimal" /></Field>}
      <Field label="Minimum order" name="minSubtotal"><Input name="minSubtotal" inputMode="decimal" placeholder="0.00" /></Field>
      {type === "PERCENT" && <Field label="Max discount" name="maxDiscount" optional><Input name="maxDiscount" inputMode="decimal" /></Field>}
      <Field label="Starts" name="startsAt"><Input name="startsAt" type="date" /></Field>
      <Field label="Ends" name="endsAt"><Input name="endsAt" type="date" /></Field>
      <Field label="Total uses" name="usageLimit" optional><Input name="usageLimit" type="number" min={1} /></Field>
      <Field label="Uses per customer" name="perCustomerLimit" optional><Input name="perCustomerLimit" type="number" min={1} /></Field>
      <Field label="Applies to" name="scope"><Select name="scope" value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: "ALL", label: "Whole order" }, { value: "CATEGORIES", label: "Categories" }, { value: "PRODUCTS", label: "Products" }]} /></Field>
      <Field label="Campaign" name="campaignId" optional><Select name="campaignId" placeholder="None" options={campaigns} /></Field>
      {targets.length > 0 && (
        <fieldset className="sm:col-span-3">
          <legend className="mb-2 text-sm font-medium">Choose {scope === "CATEGORIES" ? "categories" : "products"}</legend>
          <div className="flex max-h-44 flex-wrap gap-x-5 gap-y-2 overflow-y-auto rounded-xl bg-surface-2 p-3">{targets.map((t) => <Checkbox key={t.value} name="targetIds" value={t.value} label={t.label} />)}</div>
        </fieldset>
      )}
      <Field label="Description" name="description" className="sm:col-span-3"><Input name="description" /></Field>
      <div className="flex flex-wrap items-center gap-5 sm:col-span-3">
        <Checkbox name="firstOrderOnly" label="First order only" />
        <Checkbox name="active" label="Active" defaultChecked />
        <SubmitButton>Create promotion</SubmitButton>
      </div>
    </Form>
  );
}

export function SocialComposer({ products, campaigns, baseUrl, configured }: { products: { value: string; label: string; slug: string; image: string | null }[]; campaigns: { value: string; label: string; utm: string }[]; baseUrl: string; configured: Record<string, boolean> }) {
  const [content, setContent] = useState("");
  const [productId, setProductId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [when, setWhen] = useState<"draft" | "now" | "later">("now");
  const [image, setImage] = useState("");
  const product = products.find((p) => p.value === productId);
  const campaign = campaigns.find((c) => c.value === campaignId);
  const path = product ? `/product/${product.slug}` : "/shop";
  const link = `${baseUrl}${path}?utm_source=social&utm_medium=post&utm_campaign=${campaign?.utm ?? "organic"}`;
  return (
    <Form action={saveSocialPostAction} resetOnSuccess refresh className="space-y-4">
      <input type="hidden" name="when" value={when} />
      <input type="hidden" name="link" value={link} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Promote a product" name="productId"><Select name="productId" value={productId} onChange={(e) => { setProductId(e.target.value); const p = products.find((x) => x.value === e.target.value); if (p?.image && !image) setImage(p.image.startsWith("/") ? `${baseUrl}${p.image}` : p.image); }} placeholder="Whole shop" options={products} /></Field>
        <Field label="Campaign" name="campaignId"><Select name="campaignId" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="Organic" options={campaigns} /></Field>
      </div>
      <Field label="Post" name="content" required hint={`${content.length} characters · X allows 280`}>
        <Textarea name="content" rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="🐖 Fresh pork chops this weekend! Order online or on WhatsApp…" />
      </Field>
      <Field label="Image URL (public https)" name="imageUrl" hint="Required for Instagram. Product photos fill in automatically."><Input name="imageUrl" value={image} onChange={(e) => setImage(e.target.value)} /></Field>
      <p className="break-all rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Tracked link: {link}</p>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Platforms</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {SOCIAL_PLATFORMS.map((p) => <Checkbox key={p} name="platforms" value={p} label={SOCIAL_PLATFORM_LABELS[p]} description={configured[p] ? "Auto-publish" : "Share manually"} defaultChecked={p === "FACEBOOK" || p === "WHATSAPP"} />)}
        </div>
      </fieldset>
      <div className="space-y-3 rounded-xl bg-surface-2 p-4">
        <div className="flex flex-wrap gap-4 text-sm">
          {([["now", "Publish now"], ["later", "Schedule"], ["draft", "Save draft"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="radio" checked={when === k} onChange={() => setWhen(k)} className="accent-[var(--primary)]" /> {l}</label>
          ))}
        </div>
        {when === "later" && <Field label="Publish at" name="scheduledAt"><Input name="scheduledAt" type="datetime-local" /></Field>}
        <SubmitButton className={cn(when === "draft" && "!bg-surface-3 !text-fg")}>{when === "now" ? "Publish" : when === "later" ? "Schedule post" : "Save draft"}</SubmitButton>
      </div>
    </Form>
  );
}
