import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignMetrics, campaigns, orders, promotions } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { centsToInput, formatMoney } from "@/lib/money";
import { formatDate, formatPercent, todayInTz } from "@/lib/format";
import { campaignPerformance } from "@/lib/services/analytics";
import { appUrl } from "@/lib/request";
import { shareLinks, utmLink } from "@/lib/social";
import { CAMPAIGN_CHANNEL_LABELS, CAMPAIGN_STATUS_META, ORDER_STATUS_META } from "@/lib/constants";
import { Card, CardBody, CardHeader, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { CampaignForm, CopyButton, MetricForm } from "@/components/admin/marketing-forms";
import { StatTile } from "@/components/admin/bits";
import { TimeSeriesChart } from "@/components/charts";

export default async function CampaignPage(props: PageProps<"/admin/campaigns/[id]">) {
  await requireStaff("marketing:manage");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!c) notFound();
  const cur = (await getSettings()).commerce.currency;
  const [perf, metrics, attributed, promos] = await Promise.all([
    campaignPerformance().then((r) => r.find((x) => x.id === id)!),
    db.select().from(campaignMetrics).where(eq(campaignMetrics.campaignId, id)).orderBy(asc(campaignMetrics.date)),
    db.select().from(orders).where(eq(orders.campaignId, id)).orderBy(desc(orders.createdAt)).limit(30),
    db.select({ code: promotions.code }).from(promotions).where(eq(promotions.campaignId, id)),
  ]);
  const base = appUrl("");
  const sources = ["facebook", "instagram", "whatsapp", "sms", "radio", "flyer"];
  const primary = utmLink(base, c.landingPath, c.channel.toLowerCase(), c.utmCampaign, "paid");
  const shares = shareLinks(c.name, primary);
  return (
    <>
      <PageHeader back={{ href: "/admin/campaigns", label: "Campaigns" }} title={<span className="flex items-center gap-3">{c.name}<StatusBadge status={c.status} meta={CAMPAIGN_STATUS_META} /></span>} description={`${CAMPAIGN_CHANNEL_LABELS[c.channel]}${c.startDate ? ` · ${formatDate(c.startDate)}` : ""}${c.endDate ? ` – ${formatDate(c.endDate)}` : ""}${c.objective ? ` · ${c.objective}` : ""}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label="Spend" value={formatMoney(perf.spend, cur)} hint={`of ${formatMoney(perf.budget, cur)}`} />
        <StatTile label="Reach" value={perf.impressions.toLocaleString()} />
        <StatTile label="Clicks" value={perf.clicks.toLocaleString()} hint={`CTR ${formatPercent(perf.ctr)}`} />
        <StatTile label="Orders" value={String(perf.orders)} hint={`${perf.customers} customers`} />
        <StatTile label="Revenue" value={formatMoney(perf.revenue, cur)} />
        <StatTile label="ROAS" value={perf.roas !== null ? `${perf.roas.toFixed(1)}×` : "—"} hint={perf.cpa !== null ? `${formatMoney(perf.cpa, cur)} per order` : undefined} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Tracking links" description="Use these in ads, posts and flyers (QR codes) so orders are credited to this campaign." />
          <CardBody className="space-y-2">
            {sources.map((s) => {
              const link = utmLink(base, c.landingPath, s, c.utmCampaign, s === "radio" || s === "flyer" ? "offline" : "paid");
              return (
                <div key={s} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="min-w-0"><span className="text-xs font-semibold uppercase text-muted">{s}</span><span className="block truncate text-xs">{link}</span></span>
                  <CopyButton text={link} />
                </div>
              );
            })}
            {promos.length > 0 && <p className="pt-2 text-sm">Offline promo codes linked: <strong>{promos.map((p) => p.code).join(", ")}</strong> — orders using them count towards this campaign.</p>}
            <div className="flex flex-wrap gap-2 pt-2 text-sm">
              <a href={shares.whatsapp} target="_blank" rel="noopener noreferrer" className="link">Share on WhatsApp</a>
              {shares.facebook && <a href={shares.facebook} target="_blank" rel="noopener noreferrer" className="link">Share on Facebook</a>}
              <a href={shares.x} target="_blank" rel="noopener noreferrer" className="link">Share on X</a>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Daily results" description="Enter spend and results from Meta Ads Manager, the radio station, etc." />
          <CardBody className="space-y-4">
            <MetricForm campaignId={id} today={todayInTz()} />
            {metrics.length > 1 && <TimeSeriesChart labels={metrics.map((m) => m.date)} currency={cur} height={180} series={[{ key: "spend", label: "Spend", values: metrics.map((m) => m.spend), kind: "area" }]} />}
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Attributed orders" />
        <Table>
          <thead><tr><Th>Order</Th><Th>Customer</Th><Th>Source</Th><Th>Status</Th><Th align="right">Total</Th></tr></thead>
          <tbody>
            {attributed.map((o) => <tr key={o.id}><Td><Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">{o.number}</Link><p className="text-xs text-muted">{formatDate(o.createdAt)}</p></Td><Td>{o.contactName}</Td><Td className="text-muted">{o.utmSource ?? (o.promoCode ? `code ${o.promoCode}` : "—")}</Td><Td><StatusBadge status={o.status} meta={ORDER_STATUS_META} /></Td><Td align="right">{formatMoney(o.total, cur)}</Td></tr>)}
            {attributed.length === 0 && <tr><Td colSpan={5} className="py-8 text-center text-muted">No orders attributed yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Edit campaign" />
        <CardBody><CampaignForm v={{ id: c.id, name: c.name, channel: c.channel, objective: c.objective ?? "", status: c.status, startDate: c.startDate ?? "", endDate: c.endDate ?? "", budget: centsToInput(c.budget), utmCampaign: c.utmCampaign, landingPath: c.landingPath, targetAudience: c.targetAudience ?? "", notes: c.notes ?? "" }} /></CardBody>
      </Card>
    </>
  );
}
