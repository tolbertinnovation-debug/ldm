import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatPercent } from "@/lib/format";
import { campaignPerformance } from "@/lib/services/analytics";
import { CAMPAIGN_CHANNEL_LABELS, CAMPAIGN_STATUS_META } from "@/lib/constants";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { CampaignForm } from "@/components/admin/marketing-forms";
import { StatTile } from "@/components/admin/bits";

export const metadata = { title: "Ad campaigns" };

export default async function CampaignsPage() {
  await requireStaff("marketing:manage");
  const cur = (await getSettings()).commerce.currency;
  const rows = await campaignPerformance();
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  const orders = rows.reduce((a, r) => a + r.orders, 0);
  return (
    <>
      <PageHeader title="Advertising campaigns" description="Plan campaigns on Facebook, radio, flyers or WhatsApp, record spend and see the orders and revenue each one brings." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total ad spend" value={formatMoney(spend, cur)} />
        <StatTile label="Attributed revenue" value={formatMoney(revenue, cur)} />
        <StatTile label="Return on ad spend" value={spend ? `${(revenue / spend).toFixed(1)}×` : "—"} />
        <StatTile label="Cost per order" value={orders ? formatMoney(Math.round(spend / orders), cur) : "—"} />
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={<Megaphone className="h-6 w-6" />} title="No campaigns yet" /> : (
          <Table>
            <thead><tr><Th>Campaign</Th><Th>Status</Th><Th align="right">Budget used</Th><Th align="right">CTR</Th><Th align="right">Orders</Th><Th align="right">Revenue</Th><Th align="right">ROAS</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/50">
                  <Td><Link href={`/admin/campaigns/${c.id}`} className="font-semibold hover:underline">{c.name}</Link><p className="text-xs text-muted">{CAMPAIGN_CHANNEL_LABELS[c.channel as keyof typeof CAMPAIGN_CHANNEL_LABELS]} · {c.utmCampaign}</p></Td>
                  <Td><StatusBadge status={c.status as "ACTIVE"} meta={CAMPAIGN_STATUS_META} /></Td>
                  <Td align="right">{formatMoney(c.spend, cur)}<p className="text-xs text-muted">of {formatMoney(c.budget, cur)}</p></Td>
                  <Td align="right">{formatPercent(c.ctr)}</Td>
                  <Td align="right">{c.orders}</Td>
                  <Td align="right" className="font-semibold">{formatMoney(c.revenue, cur)}</Td>
                  <Td align="right" className={c.roas !== null && c.roas < 1 ? "text-danger" : "font-semibold text-success-fg"}>{c.roas !== null ? `${c.roas.toFixed(1)}×` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="New campaign" />
        <CardBody><CampaignForm v={{ name: "", channel: "FACEBOOK", objective: "", status: "PLANNED", startDate: "", endDate: "", budget: "", utmCampaign: "", landingPath: "/shop", targetAudience: "", notes: "" }} /></CardBody>
      </Card>
    </>
  );
}
