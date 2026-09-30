import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts, messages, products } from "@/lib/db/schema";
import { deliverMessage, markMessageFailed, notifyAdmins, queueMessage } from "@/lib/messaging";
import { firstName, renderTemplate } from "@/lib/messaging/templates";
import { appUrl } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { publishSocialPost } from "@/lib/social";
import { audienceMembers } from "@/lib/services/audience";
import { checkMomoPayment } from "@/lib/services/online-payments";
import { formatQuantity } from "@/lib/constants";
import { claimJobs, completeJob, failJob, type ClaimedJob } from "./queue";

async function sendBroadcast(broadcastId: string) {
  const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId));
  if (!b || (b.status !== "SCHEDULED" && b.status !== "SENDING")) return;
  if (b.status === "SCHEDULED" && b.scheduledAt && b.scheduledAt.getTime() > Date.now() + 60_000) return; // rescheduled later
  await db.update(broadcasts).set({ status: "SENDING", startedAt: new Date() }).where(eq(broadcasts.id, broadcastId));
  const settings = await getSettings();
  const members = await audienceMembers(b.audience, b.channel);
  let queued = 0;
  for (const m of members) {
    const to = b.channel === "EMAIL" ? m.email : m.phone;
    if (!to) continue;
    const vars = { firstName: firstName(m.name), name: m.name, business: settings.business.name, shopUrl: appUrl("/shop") };
    const footer = b.channel === "EMAIL" ? "" : "\nReply STOP to opt out.";
    const id = await queueMessage({
      channel: b.channel,
      to,
      subject: b.subject ? renderTemplate(b.subject, vars) : null,
      body: renderTemplate(b.body, vars) + footer,
      customerId: m.id,
      broadcastId: b.id,
    });
    if (id) queued++;
  }
  await db
    .update(broadcasts)
    .set({ status: "SENT", recipientCount: queued, completedAt: new Date() })
    .where(eq(broadcasts.id, broadcastId));
}

/** Refreshes the sent/failed counters shown on each broadcast. */
export async function refreshBroadcastStats(broadcastId: string) {
  await db.execute(sql`
    update broadcasts b set
      sent_count = s.sent, failed_count = s.failed
    from (
      select count(*) filter (where status in ('SENT','DELIVERED','READ'))::int as sent,
             count(*) filter (where status = 'FAILED')::int as failed
      from messages where broadcast_id = ${broadcastId}
    ) s where b.id = ${broadcastId}
  `);
}

async function stockAlert(productId: string) {
  const settings = await getSettings();
  if (!settings.notifications.notifyLowStock) return;
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  if (!p) return;
  await notifyAdmins("admin.low_stock", {
    product: p.name,
    stock: formatQuantity(p.stockQty, p.unit),
    adminUrl: appUrl(`/admin/products/${p.id}`),
  });
}

async function runJob(job: ClaimedJob) {
  const payload = job.payload as Record<string, string>;
  switch (job.type) {
    case "message.send":
      return deliverMessage(payload.messageId!);
    case "broadcast.send":
      return sendBroadcast(payload.broadcastId!);
    case "social.publish":
      return publishSocialPost(payload.postId!);
    case "payment.check":
      return checkMomoPayment(payload.paymentId!);
    case "stock.alert":
      return stockAlert(payload.productId!);
    default:
      throw new Error(`Unknown job type ${job.type}`);
  }
}

let running = false;

/** Claims and runs due jobs. Returns the number processed. */
export async function processJobs({ limit = 50 }: { limit?: number } = {}) {
  if (running) return 0; // one runner per process at a time; other processes coordinate via SKIP LOCKED
  running = true;
  let processed = 0;
  try {
    const claimed = await claimJobs(limit);
    const broadcastIds = new Set<string>();
    for (const job of claimed) {
      try {
        await runJob(job);
        await completeJob(job.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await failJob(job, message);
        if (job.type === "message.send" && job.attempts >= job.maxAttempts) {
          await markMessageFailed((job.payload as { messageId: string }).messageId, message);
        }
      }
      if (job.type === "message.send") {
        const [m] = await db
          .select({ b: messages.broadcastId })
          .from(messages)
          .where(eq(messages.id, (job.payload as { messageId: string }).messageId));
        if (m?.b) broadcastIds.add(m.b);
      }
      processed++;
    }
    for (const id of broadcastIds) await refreshBroadcastStats(id);
  } finally {
    running = false;
  }
  return processed;
}
