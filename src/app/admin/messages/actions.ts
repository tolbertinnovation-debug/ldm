"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { broadcasts, messageTemplates } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { enqueue, kickJobs } from "@/lib/jobs/queue";
import { audienceCount } from "@/lib/services/audience";
import { CUSTOMER_TYPES } from "@/lib/constants";

export async function saveTemplateAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("settings:manage").catch(() => assertPermission("broadcasts:manage"));
    const d = z.object({ key: zf.requiredText("Key", 60), subject: zf.optionalText(200), body: zf.requiredText("Message", 1000), active: zf.checkbox() }).parse(formObject(formData));
    const [t] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, d.key));
    if (!t) throw new UserError("Template not found.");
    await db.update(messageTemplates).set({ subject: d.subject, body: d.body, active: d.active }).where(eq(messageTemplates.key, d.key));
    await audit({ actor, action: "template.update", entityType: "template", entityId: d.key, summary: `Edited template ${t.name}` });
    revalidatePath("/admin/messages");
    return ok("Template saved");
  });
}

const audienceSchema = z.object({
  types: z.array(z.enum(CUSTOMER_TYPES)).default([]),
  tags: z.array(z.string().max(40)).default([]),
  orderedWithinDays: z.number().int().positive().nullable().default(null),
  notOrderedWithinDays: z.number().int().positive().nullable().default(null),
  minTotalSpent: z.number().int().nonnegative().nullable().default(null),
  productCategoryId: z.uuid().nullable().default(null),
});

function parseAudience(formData: FormData) {
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? Number(v) : null;
  };
  return audienceSchema.parse({
    types: formData.getAll("types").map(String).filter(Boolean),
    tags: String(formData.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    orderedWithinDays: num("orderedWithinDays"),
    notOrderedWithinDays: num("notOrderedWithinDays"),
    minTotalSpent: num("minTotalSpent") !== null ? Math.round(num("minTotalSpent")! * 100) : null,
    productCategoryId: String(formData.get("productCategoryId") ?? "") || null,
  });
}

export async function previewAudienceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await assertPermission("broadcasts:manage");
    const channel = z.enum(["WHATSAPP", "SMS", "EMAIL"]).parse(formData.get("channel"));
    const count = await audienceCount(parseAudience(formData), channel);
    return ok(undefined, { count });
  });
}

export async function saveBroadcastAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("broadcasts:manage");
    const d = z
      .object({ name: zf.requiredText("Name", 120), channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]), subject: zf.optionalText(200), body: zf.requiredText("Message", 1600), when: z.enum(["draft", "now", "later"]), scheduledAt: zf.optionalText(30), campaignId: zf.optionalUuid() })
      .parse(formObject(formData));
    if (d.channel === "EMAIL" && !d.subject) throw new UserError("Email needs a subject.", { subject: "Required" });
    const audience = parseAudience(formData);
    const count = await audienceCount(audience, d.channel);
    if (d.when !== "draft" && count === 0) throw new UserError("No opted-in customers match this audience.");
    let scheduledAt: Date | null = null;
    if (d.when === "later") {
      scheduledAt = d.scheduledAt ? new Date(d.scheduledAt) : null;
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) throw new UserError("Choose a future date and time.", { scheduledAt: "Must be in the future" });
    }
    const status = d.when === "draft" ? "DRAFT" : "SCHEDULED";
    const [b] = await db
      .insert(broadcasts)
      .values({ name: d.name, channel: d.channel, subject: d.subject, body: d.body, audience, status, scheduledAt: d.when === "now" ? new Date() : scheduledAt, recipientCount: count, campaignId: d.campaignId, createdById: actor.id })
      .returning();
    if (status === "SCHEDULED") {
      await enqueue("broadcast.send", { broadcastId: b!.id }, { runAt: b!.scheduledAt ?? new Date(), maxAttempts: 3 });
      kickJobs();
    }
    await audit({ actor, action: "broadcast.create", entityType: "broadcast", entityId: b!.id, summary: `${d.name} (${d.channel}, ${count} recipients, ${d.when})` });
    revalidatePath("/admin/broadcasts");
    return ok(d.when === "now" ? `Sending to ${count} customers…` : d.when === "later" ? `Scheduled for ${count} customers` : "Draft saved");
  });
}

export async function broadcastOpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("broadcasts:manage");
    const d = z.object({ id: z.uuid(), op: z.enum(["send", "cancel"]) }).parse(formObject(formData));
    const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, d.id));
    if (!b) throw new UserError("Broadcast not found.");
    if (d.op === "cancel") {
      if (b.status !== "SCHEDULED" && b.status !== "DRAFT") throw new UserError("Only drafts or scheduled broadcasts can be cancelled.");
      await db.update(broadcasts).set({ status: "CANCELLED" }).where(eq(broadcasts.id, d.id));
    } else {
      if (b.status !== "DRAFT") throw new UserError("Only drafts can be sent.");
      await db.update(broadcasts).set({ status: "SCHEDULED", scheduledAt: new Date() }).where(eq(broadcasts.id, d.id));
      await enqueue("broadcast.send", { broadcastId: d.id }, { maxAttempts: 3 });
      kickJobs();
    }
    await audit({ actor, action: `broadcast.${d.op}`, entityType: "broadcast", entityId: d.id, summary: `${b.name}: ${d.op}` });
    revalidatePath("/admin/broadcasts");
    return ok(d.op === "send" ? "Sending now" : "Cancelled");
  });
}
