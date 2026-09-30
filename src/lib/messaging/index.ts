import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db";
import { customers, messages, messageTemplates } from "@/lib/db/schema";
import { enqueue, kickJobs } from "@/lib/jobs/queue";
import { normalizePhone } from "@/lib/phone";
import { appUrl } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import type { MessageChannel } from "@/lib/constants";
import { sendEmail, sendSms, sendWhatsApp } from "./providers";
import { DEFAULT_TEMPLATES, emailHtml, renderTemplate } from "./templates";

export type QueueMessageInput = {
  channel: MessageChannel;
  to: string;
  body: string;
  subject?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  broadcastId?: string | null;
  templateKey?: string | null;
  sentById?: string | null;
  tx?: DbOrTx;
  runAt?: Date;
};

/** Records an outbound message as QUEUED and schedules its delivery. */
export async function queueMessage(input: QueueMessageInput) {
  const conn = input.tx ?? db;
  const to = input.channel === "EMAIL" ? input.to.trim().toLowerCase() : normalizePhone(input.to);
  if (!to) return null;
  const [row] = await conn
    .insert(messages)
    .values({
      channel: input.channel,
      direction: "OUTBOUND",
      status: "QUEUED",
      toAddress: to,
      subject: input.subject ?? null,
      body: input.body,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      broadcastId: input.broadcastId ?? null,
      templateKey: input.templateKey ?? null,
      sentById: input.sentById ?? null,
    })
    .returning({ id: messages.id });
  await enqueue("message.send", { messageId: row!.id }, { tx: conn, runAt: input.runAt });
  if (!input.tx) kickJobs();
  return row!.id;
}

async function loadTemplate(key: string) {
  const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, key)).limit(1);
  if (row) return row.active ? row : null;
  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === key);
  return fallback ? { ...fallback, active: true } : null;
}

type Recipient = { phone?: string | null; email?: string | null; preferredChannel?: MessageChannel | null };

/** Picks the best channel for a transactional message to this recipient. */
export async function pickChannel(recipient: Recipient): Promise<{ channel: MessageChannel; to: string } | null> {
  const settings = await getSettings();
  const preferred = recipient.preferredChannel ?? settings.notifications.defaultChannel;
  if (preferred === "EMAIL" && recipient.email) return { channel: "EMAIL", to: recipient.email };
  if (recipient.phone) return { channel: preferred === "SMS" ? "SMS" : "WHATSAPP", to: recipient.phone };
  if (recipient.email) return { channel: "EMAIL", to: recipient.email };
  return null;
}

/** Renders a template and queues it to a recipient via their preferred channel. */
export async function sendTemplate(
  key: string,
  recipient: Recipient & { customerId?: string | null },
  vars: Record<string, string | number | null | undefined>,
  extra: { orderId?: string | null; tx?: DbOrTx; channel?: MessageChannel } = {},
) {
  const template = await loadTemplate(key);
  if (!template) return null;
  const settings = await getSettings();
  const allVars = { business: settings.business.name, businessPhone: settings.business.phone, ...vars };
  let target = await pickChannel(recipient);
  if (extra.channel) {
    const to = extra.channel === "EMAIL" ? recipient.email : recipient.phone;
    target = to ? { channel: extra.channel, to } : target;
  }
  if (!target) return null;
  return queueMessage({
    channel: target.channel,
    to: target.to,
    subject: renderTemplate(template.subject ?? "", allVars),
    body: renderTemplate(template.body, allVars),
    customerId: recipient.customerId,
    orderId: extra.orderId,
    templateKey: key,
    tx: extra.tx,
  });
}

/** Alerts the business owner/staff (phone and/or email from settings). */
export async function notifyAdmins(key: string, vars: Record<string, string | number | null | undefined>) {
  const settings = await getSettings();
  const n = settings.notifications;
  if (n.adminPhone) await sendTemplate(key, { phone: n.adminPhone, preferredChannel: n.defaultChannel === "EMAIL" ? "WHATSAPP" : n.defaultChannel }, vars);
  if (n.adminEmail) await sendTemplate(key, { email: n.adminEmail }, vars, { channel: "EMAIL" });
}

/** Performs delivery for a queued message. Throws on retryable failure. */
export async function deliverMessage(messageId: string) {
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msg || msg.status !== "QUEUED") return;
  const settings = await getSettings();

  let result;
  if (msg.channel === "EMAIL") {
    let unsubscribeUrl: string | null = null;
    if (msg.broadcastId && msg.customerId) {
      const [c] = await db.select({ token: customers.unsubscribeToken }).from(customers).where(eq(customers.id, msg.customerId));
      if (c) unsubscribeUrl = appUrl(`/unsubscribe/${c.token}`);
    }
    const html = emailHtml({
      business: settings.business.name,
      body: msg.body,
      unsubscribeUrl,
      footer: `${settings.business.name} · ${settings.business.address}, ${settings.business.country}`,
    });
    result = await sendEmail(
      msg.toAddress,
      msg.subject || settings.business.name,
      msg.body,
      html,
      unsubscribeUrl ? { "List-Unsubscribe": `<${unsubscribeUrl}>` } : undefined,
    );
  } else if (msg.channel === "SMS") {
    result = await sendSms(msg.toAddress, msg.body);
  } else {
    result = await sendWhatsApp(msg.toAddress, msg.body);
  }

  if (result.ok) {
    await db
      .update(messages)
      .set({ status: "SENT", provider: result.provider, providerMessageId: result.providerMessageId ?? null, sentAt: new Date(), error: null })
      .where(eq(messages.id, messageId));
  } else if (result.retryable) {
    await db.update(messages).set({ error: result.error ?? "Send failed", provider: result.provider }).where(eq(messages.id, messageId));
    throw new Error(result.error ?? "Send failed");
  } else {
    await db
      .update(messages)
      .set({ status: "FAILED", error: result.error ?? "Send failed", provider: result.provider })
      .where(eq(messages.id, messageId));
  }
}

/** Marks a message permanently failed once the job gives up retrying. */
export async function markMessageFailed(messageId: string, error: string) {
  await db
    .update(messages)
    .set({ status: "FAILED", error })
    .where(and(eq(messages.id, messageId), eq(messages.status, "QUEUED")));
}

const STOP_WORDS = ["STOP", "UNSUBSCRIBE", "STOPALL", "CANCEL", "END", "QUIT"];

/** Stores an inbound SMS/WhatsApp message, links it to a customer and honours STOP. */
export async function recordInbound(input: {
  channel: "SMS" | "WHATSAPP";
  from: string;
  to?: string | null;
  body: string;
  provider: string;
  providerMessageId?: string | null;
  profileName?: string | null;
}) {
  const phone = normalizePhone(input.from);
  if (!phone) return;
  if (input.providerMessageId) {
    const [dupe] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.providerMessageId, input.providerMessageId), eq(messages.direction, "INBOUND")))
      .limit(1);
    if (dupe) return; // webhook retry
  }
  let [customer] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({ name: input.profileName?.trim() || phone, phone, source: `Inbound ${input.channel === "SMS" ? "SMS" : "WhatsApp"}` })
      .onConflictDoNothing()
      .returning();
    if (!customer) [customer] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  }
  await db.insert(messages).values({
    channel: input.channel,
    direction: "INBOUND",
    status: "RECEIVED",
    toAddress: input.to ?? "business",
    fromAddress: phone,
    body: input.body.slice(0, 4000),
    provider: input.provider,
    providerMessageId: input.providerMessageId ?? null,
    customerId: customer?.id ?? null,
    sentAt: new Date(),
  });
  if (customer && STOP_WORDS.includes(input.body.trim().toUpperCase())) {
    await db
      .update(customers)
      .set(input.channel === "SMS" ? { marketingSms: false } : { marketingWhatsapp: false })
      .where(eq(customers.id, customer.id));
    const settings = await getSettings();
    await queueMessage({
      channel: input.channel,
      to: phone,
      customerId: customer.id,
      body: `You have been unsubscribed from ${settings.business.name} promotions. You will still receive order updates.`,
    });
  }
}

/** Applies delivery receipts from providers (sent → delivered → read / failed). */
export async function applyDeliveryStatus(providerMessageId: string, status: string, error?: string | null) {
  const map: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = {
    sent: "SENT",
    queued: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
    undelivered: "FAILED",
    rejected: "FAILED",
  };
  const next = map[status.toLowerCase()];
  if (!next) return;
  await db
    .update(messages)
    .set({ status: next, ...(error ? { error } : {}) })
    .where(and(eq(messages.providerMessageId, providerMessageId), eq(messages.direction, "OUTBOUND")));
}

export async function unreadInboundCount() {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.direction, "INBOUND"), sql`${messages.readAt} is null`));
  return row?.n ?? 0;
}

export async function conversation(customerId: string, limit = 100) {
  return db.select().from(messages).where(eq(messages.customerId, customerId)).orderBy(desc(messages.createdAt)).limit(limit);
}
