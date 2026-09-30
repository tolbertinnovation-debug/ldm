import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { customers, messages, messageTemplates, users } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { channelStatus } from "@/lib/messaging/providers";
import { formatDateTime, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { MESSAGE_CHANNEL_LABELS, MESSAGE_STATUS_META } from "@/lib/constants";
import { Alert, Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui";
import { TemplateForm } from "@/components/admin/messaging-forms";
import { sp } from "@/components/admin/bits";

export const metadata = { title: "Inbox" };

export default async function MessagesPage(props: PageProps<"/admin/messages">) {
  const user = await requireStaff("messages:view");
  const tab = sp((await props.searchParams).tab) ?? "inbox";
  const providers = channelStatus();
  const simulated = Object.entries(providers).filter(([, v]) => v === "log").map(([k]) => MESSAGE_CHANNEL_LABELS[k as keyof typeof MESSAGE_CHANNEL_LABELS]);

  let content: React.ReactNode = null;
  if (tab === "inbox") {
    const threads = await db.execute<{ customer_id: string; name: string; phone: string | null; body: string; channel: string; direction: string; at: Date; unread: number }>(sql`
      select distinct on (m.customer_id) m.customer_id, c.name, c.phone, m.body, m.channel, m.direction, m.created_at as at,
        (select count(*)::int from messages u where u.customer_id = m.customer_id and u.direction = 'INBOUND' and u.read_at is null) as unread
      from messages m join customers c on c.id = m.customer_id
      where m.customer_id is not null and m.broadcast_id is null
      order by m.customer_id, m.created_at desc
    `);
    const list = threads.rows.sort((a, b) => b.unread - a.unread || new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 100);
    content = (
      <Card>
        {list.length === 0 ? <EmptyState icon={<Inbox className="h-6 w-6" />} title="No conversations yet" description="Customer replies on WhatsApp and SMS will appear here." /> : (
          <ul className="divide-y divide-border">
            {list.map((t) => (
              <li key={t.customer_id}>
                <Link href={`/admin/customers/${t.customer_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
                  <Avatar name={t.name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2"><span className={t.unread ? "font-bold" : "font-medium"}>{t.name}</span><span className="text-xs text-muted">{t.phone ? formatPhone(t.phone) : ""}</span></p>
                    <p className={`truncate text-sm ${t.unread ? "text-fg" : "text-muted"}`}>{t.direction === "OUTBOUND" && "You: "}{t.body}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">{timeAgo(t.at)}</p>
                    <p className="mt-1 flex justify-end gap-1"><Badge>{MESSAGE_CHANNEL_LABELS[t.channel as keyof typeof MESSAGE_CHANNEL_LABELS]}</Badge>{t.unread > 0 && <Badge tone="accent">{t.unread} new</Badge>}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  } else if (tab === "log") {
    const rows = await db.select({ m: messages, customer: customers.name, by: users.name }).from(messages).leftJoin(customers, eq(customers.id, messages.customerId)).leftJoin(users, eq(users.id, messages.sentById)).where(eq(messages.direction, "OUTBOUND")).orderBy(desc(messages.createdAt)).limit(150);
    content = (
      <Card>
        <Table>
          <thead><tr><Th>When</Th><Th>To</Th><Th>Channel</Th><Th>Message</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map(({ m, customer, by }) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(m.createdAt)}</Td>
                <Td>{customer ?? m.toAddress}<p className="text-xs text-muted">{m.templateKey ?? (by ? `by ${by}` : m.broadcastId ? "broadcast" : "")}</p></Td>
                <Td>{MESSAGE_CHANNEL_LABELS[m.channel]}<p className="text-xs text-muted">{m.provider}</p></Td>
                <Td className="max-w-md"><p className="line-clamp-2 text-sm">{m.body}</p>{m.error && <p className="text-xs text-danger">{m.error}</p>}</Td>
                <Td><StatusBadge status={m.status} meta={MESSAGE_STATUS_META} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    );
  } else {
    const templates = await db.select().from(messageTemplates).orderBy(asc(messageTemplates.key));
    content = (
      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((t) => <Card key={t.id}><CardBody><TemplateForm t={t} /></CardBody></Card>)}
        <Card className="lg:col-span-2"><CardHeader title="Placeholders" /><CardBody className="text-sm text-muted">{"{{firstName}} {{orderNumber}} {{total}} {{balance}} {{trackUrl}} {{pickupLocation}} {{driverName}} {{driverPhone}} {{business}} {{businessPhone}} {{invoiceUrl}} {{dueDate}} {{service}} {{bookingNumber}} {{when}} {{code}}"}</CardBody></Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Messages" description="WhatsApp, SMS and email with customers — conversations, delivery log and automatic message templates." />
      {simulated.length > 0 && <Alert tone="warning" className="mb-4" title={`${simulated.join(", ")} not connected yet`}>Messages on these channels are recorded but not delivered. Add provider keys in your environment (see Settings → Integrations).</Alert>}
      <Tabs active={tab} tabs={[{ key: "inbox", label: "Conversations", href: "/admin/messages" }, { key: "log", label: "Sent log", href: "/admin/messages?tab=log" }, ...(can(user.role, "settings:manage") || can(user.role, "broadcasts:manage") ? [{ key: "templates", label: "Automatic messages", href: "/admin/messages?tab=templates" }] : [])]} />
      <div className="mt-4">{content}</div>
    </>
  );
}
