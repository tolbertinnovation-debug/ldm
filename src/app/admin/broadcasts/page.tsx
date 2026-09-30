import { asc, desc, eq } from "drizzle-orm";
import { Send } from "lucide-react";
import { db } from "@/lib/db";
import { broadcasts, campaigns, categories, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { BROADCAST_STATUS_META, CUSTOMER_TYPE_LABELS, MESSAGE_CHANNEL_LABELS } from "@/lib/constants";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { BroadcastComposer } from "@/components/admin/messaging-forms";
import { broadcastOpAction } from "../messages/actions";

export const metadata = { title: "Broadcasts" };

export default async function BroadcastsPage() {
  await requireStaff("broadcasts:manage");
  const [rows, cats, camps] = await Promise.all([
    db.select({ b: broadcasts, by: users.name }).from(broadcasts).leftJoin(users, eq(users.id, broadcasts.createdById)).orderBy(desc(broadcasts.createdAt)).limit(50),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).orderBy(desc(campaigns.createdAt)),
  ]);
  return (
    <>
      <PageHeader title="Broadcasts" description="Send offers and news to opted-in customers by WhatsApp, SMS or email — targeted by segment." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="New broadcast" />
          <CardBody><BroadcastComposer categories={cats.map((c) => ({ value: c.id, label: c.name }))} campaigns={camps.map((c) => ({ value: c.id, label: c.name }))} /></CardBody>
        </Card>
        <div className="space-y-3">
          {rows.length === 0 && <Card><EmptyState icon={<Send className="h-6 w-6" />} title="No broadcasts yet" /></Card>}
          {rows.map(({ b, by }) => {
            const a = b.audience;
            const summary = [a.types?.length ? a.types.map((t) => CUSTOMER_TYPE_LABELS[t as keyof typeof CUSTOMER_TYPE_LABELS]).join(", ") : "All customer types", a.orderedWithinDays && `ordered in ${a.orderedWithinDays}d`, a.notOrderedWithinDays && `inactive ${a.notOrderedWithinDays}d+`, a.tags?.length && `tags: ${a.tags.join(", ")}`].filter(Boolean).join(" · ");
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-xs text-muted">{MESSAGE_CHANNEL_LABELS[b.channel]} · {summary} · {by}</p>
                  </div>
                  <StatusBadge status={b.status} meta={BROADCAST_STATUS_META} />
                </div>
                <p className="mt-2 line-clamp-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">{b.body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted">
                    {b.status === "SENT" || b.status === "SENDING" ? `${b.sentCount}/${b.recipientCount} sent${b.failedCount ? ` · ${b.failedCount} failed` : ""} · ${formatDateTime(b.completedAt ?? b.startedAt)}` : b.status === "SCHEDULED" ? `Scheduled ${formatDateTime(b.scheduledAt)} · ${b.recipientCount} recipients` : `${b.recipientCount} recipients`}
                  </span>
                  <span className="flex gap-2">
                    {b.status === "DRAFT" && <ActionButton action={broadcastOpAction} fields={{ id: b.id, op: "send" }} variant="primary" confirm={`Send "${b.name}" now?`}>Send now</ActionButton>}
                    {(b.status === "DRAFT" || b.status === "SCHEDULED") && <ActionButton action={broadcastOpAction} fields={{ id: b.id, op: "cancel" }} variant="ghost">Cancel</ActionButton>}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
