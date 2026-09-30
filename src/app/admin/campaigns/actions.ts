"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { campaignMetrics, campaigns, promotions, socialPosts } from "@/lib/db/schema";
import { formObject, formAll, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { enqueue, kickJobs } from "@/lib/jobs/queue";
import { CAMPAIGN_CHANNELS, SOCIAL_PLATFORMS } from "@/lib/constants";

export async function saveCampaignAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const res = await runAction(async () => {
    const actor = await assertPermission("marketing:manage");
    const d = z
      .object({ id: zf.optionalUuid(), name: zf.requiredText("Name", 120), channel: z.enum(CAMPAIGN_CHANNELS), objective: zf.optionalText(300), status: z.enum(["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"]), startDate: zf.optionalDate(), endDate: zf.optionalDate(), budget: zf.optionalText(20), utmCampaign: zf.optionalText(60), landingPath: zf.optionalText(200), targetAudience: zf.optionalText(300), notes: zf.optionalText(2000) })
      .parse(formObject(formData));
    const utm = slugify(d.utmCampaign || d.name).slice(0, 50);
    const [clash] = await db.select({ id: campaigns.id }).from(campaigns).where(d.id ? and(eq(campaigns.utmCampaign, utm), ne(campaigns.id, d.id)) : eq(campaigns.utmCampaign, utm));
    if (clash) throw new UserError("Another campaign uses this tracking code.", { utmCampaign: "Already used" });
    if (d.startDate && d.endDate && d.endDate < d.startDate) throw new UserError("End date is before start date.", { endDate: "Invalid" });
    const landing = d.landingPath && d.landingPath.startsWith("/") ? d.landingPath : "/";
    const values = { name: d.name, channel: d.channel, objective: d.objective, status: d.status, startDate: d.startDate, endDate: d.endDate, budget: d.budget ? parseMoney(d.budget) ?? 0 : 0, utmCampaign: utm, landingPath: landing, targetAudience: d.targetAudience, notes: d.notes };
    if (d.id) {
      await db.update(campaigns).set(values).where(eq(campaigns.id, d.id));
      revalidatePath(`/admin/campaigns/${d.id}`);
    } else {
      const [c] = await db.insert(campaigns).values({ ...values, createdById: actor.id }).returning({ id: campaigns.id });
      newId = c!.id;
    }
    await audit({ actor, action: "campaign.save", entityType: "campaign", entityId: d.id ?? newId, summary: `Saved campaign ${d.name}` });
    revalidatePath("/admin/campaigns");
    return ok("Campaign saved");
  });
  if (newId) redirect(`/admin/campaigns/${newId}`);
  return res;
}

export async function saveMetricAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertPermission("marketing:manage");
    const d = z.object({ campaignId: z.uuid(), date: zf.date("Date"), spend: zf.optionalText(20), impressions: zf.optionalInt(0, 100_000_000), clicks: zf.optionalInt(0, 100_000_000), leads: zf.optionalInt(0, 1_000_000), note: zf.optionalText(200) }).parse(formObject(formData));
    const values = { spend: d.spend ? parseMoney(d.spend) ?? 0 : 0, impressions: d.impressions ?? 0, clicks: d.clicks ?? 0, leads: d.leads ?? 0, note: d.note };
    await db.insert(campaignMetrics).values({ campaignId: d.campaignId, date: d.date, ...values }).onConflictDoUpdate({ target: [campaignMetrics.campaignId, campaignMetrics.date], set: values });
    revalidatePath(`/admin/campaigns/${d.campaignId}`);
    revalidatePath("/admin/campaigns");
    return ok("Results saved");
  });
}

const promoSchema = z.object({
  id: zf.optionalUuid(),
  name: zf.requiredText("Name", 120),
  code: zf.optionalText(30),
  description: zf.optionalText(300),
  type: z.enum(["PERCENT", "FIXED", "FREE_DELIVERY"]),
  value: zf.optionalText(20),
  minSubtotal: zf.optionalText(20),
  maxDiscount: zf.optionalText(20),
  startsAt: zf.optionalDate(),
  endsAt: zf.optionalDate(),
  usageLimit: zf.optionalInt(1, 1_000_000),
  perCustomerLimit: zf.optionalInt(1, 1000),
  firstOrderOnly: zf.checkbox(),
  scope: z.enum(["ALL", "CATEGORIES", "PRODUCTS"]),
  campaignId: zf.optionalUuid(),
  active: zf.checkbox(),
});

export async function savePromotionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("marketing:manage");
    const d = promoSchema.parse(formObject(formData));
    const code = d.code ? d.code.toUpperCase().replace(/[^A-Z0-9_-]/g, "") : null;
    if (!code) throw new UserError("Enter a promo code customers will type.", { code: "Required" });
    const [clash] = await db.select({ id: promotions.id }).from(promotions).where(d.id ? and(eq(promotions.code, code), ne(promotions.id, d.id)) : eq(promotions.code, code));
    if (clash) throw new UserError("This code already exists.", { code: "Already exists" });
    let value = 0;
    if (d.type === "PERCENT") {
      value = Math.round(Number(d.value));
      if (!(value > 0 && value <= 100)) throw new UserError("Enter a percentage between 1 and 100.", { value: "1–100" });
    } else if (d.type === "FIXED") {
      value = parseMoney(d.value ?? "") ?? 0;
      if (value <= 0) throw new UserError("Enter the discount amount.", { value: "Required" });
    }
    const targetIds = formAll(formData, "targetIds");
    if (d.scope !== "ALL" && !targetIds.length) throw new UserError("Choose which products or categories it applies to.");
    const values = {
      name: d.name, code, description: d.description, type: d.type, value,
      minSubtotal: d.minSubtotal ? parseMoney(d.minSubtotal) ?? 0 : 0,
      maxDiscount: d.maxDiscount ? parseMoney(d.maxDiscount) : null,
      startsAt: d.startsAt ? new Date(`${d.startsAt}T00:00:00Z`) : null,
      endsAt: d.endsAt ? new Date(`${d.endsAt}T23:59:59Z`) : null,
      usageLimit: d.usageLimit, perCustomerLimit: d.perCustomerLimit, firstOrderOnly: d.firstOrderOnly,
      scope: d.scope, targetIds: d.scope === "ALL" ? [] : targetIds, campaignId: d.campaignId, active: d.active,
    };
    if (d.id) await db.update(promotions).set(values).where(eq(promotions.id, d.id));
    else await db.insert(promotions).values(values);
    await audit({ actor, action: "promotion.save", entityType: "promotion", entityId: d.id, summary: `Saved promo ${code}` });
    revalidatePath("/admin/promotions");
    return ok(`Promo ${code} saved`);
  });
}

export async function saveSocialPostAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("marketing:manage");
    const d = z.object({ content: zf.requiredText("Post text", 2200), link: zf.optionalText(500), imageUrl: zf.optionalText(500), productId: zf.optionalUuid(), campaignId: zf.optionalUuid(), when: z.enum(["draft", "now", "later"]), scheduledAt: zf.optionalText(30) }).parse(formObject(formData));
    const platforms = formAll(formData, "platforms").filter((p) => (SOCIAL_PLATFORMS as readonly string[]).includes(p));
    if (!platforms.length) throw new UserError("Choose at least one platform.");
    if (d.link && !/^https?:\/\//.test(d.link)) throw new UserError("Link must start with https://", { link: "Invalid URL" });
    let scheduledAt: Date | null = null;
    if (d.when === "later") {
      scheduledAt = d.scheduledAt ? new Date(d.scheduledAt) : null;
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) throw new UserError("Choose a future time.", { scheduledAt: "Must be in the future" });
    }
    const status = d.when === "draft" ? "DRAFT" : "SCHEDULED";
    const [p] = await db.insert(socialPosts).values({ content: d.content, link: d.link, imageUrl: d.imageUrl, productId: d.productId, campaignId: d.campaignId, platforms, status, scheduledAt: d.when === "now" ? new Date() : scheduledAt, createdById: actor.id }).returning();
    if (status === "SCHEDULED") {
      await enqueue("social.publish", { postId: p!.id }, { runAt: p!.scheduledAt ?? new Date(), maxAttempts: 3 });
      kickJobs();
    }
    await audit({ actor, action: "social.create", entityType: "social_post", entityId: p!.id, summary: `Social post (${platforms.join(", ")}) ${d.when}` });
    revalidatePath("/admin/social");
    return ok(d.when === "now" ? "Publishing…" : d.when === "later" ? "Post scheduled" : "Draft saved");
  });
}

export async function socialOpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertPermission("marketing:manage");
    const d = z.object({ id: z.uuid(), op: z.enum(["publish", "delete", "mark-posted"]) }).parse(formObject(formData));
    if (d.op === "delete") await db.delete(socialPosts).where(eq(socialPosts.id, d.id));
    else if (d.op === "mark-posted") await db.update(socialPosts).set({ status: "PUBLISHED", publishedAt: new Date() }).where(eq(socialPosts.id, d.id));
    else {
      await db.update(socialPosts).set({ status: "SCHEDULED", scheduledAt: new Date() }).where(eq(socialPosts.id, d.id));
      await enqueue("social.publish", { postId: d.id }, { maxAttempts: 3 });
      kickJobs();
    }
    revalidatePath("/admin/social");
    return ok(d.op === "publish" ? "Publishing…" : d.op === "delete" ? "Deleted" : "Marked as posted");
  });
}
