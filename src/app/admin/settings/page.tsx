import { asc } from "drizzle-orm";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { db } from "@/lib/db";
import { deliveryZones, pickupLocations } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { centsToInput } from "@/lib/money";
import { appUrl } from "@/lib/request";
import { channelStatus } from "@/lib/messaging/providers";
import { flutterwaveConfigured, momoConfigured } from "@/lib/payments/gateways";
import { socialConfigured } from "@/lib/social";
import { Card, CardBody, CardHeader, PageHeader, Tabs } from "@/components/ui";
import { BusinessForm, CommerceForm, NotificationsForm, PaymentsForm, PickupForm, ZoneForm } from "@/components/admin/settings-forms";
import { CopyButton } from "@/components/admin/marketing-forms";
import { sp } from "@/components/admin/bits";

export const metadata = { title: "Settings" };

export default async function SettingsPage(props: PageProps<"/admin/settings">) {
  await requireStaff("settings:manage");
  const tab = sp((await props.searchParams).tab) ?? "business";
  const s = await getSettings();
  let body: React.ReactNode;
  if (tab === "business") body = <Card><CardBody><BusinessForm b={s.business} /></CardBody></Card>;
  else if (tab === "store") {
    const [zones, pickups] = await Promise.all([db.select().from(deliveryZones).orderBy(asc(deliveryZones.sortOrder)), db.select().from(pickupLocations)]);
    body = (
      <div className="space-y-6">
        <Card><CardHeader title="Store & checkout" /><CardBody><CommerceForm c={s.commerce} /></CardBody></Card>
        <Card>
          <CardHeader title="Delivery areas & fees" description="Name · communities · fee · free over · time · order" />
          <CardBody className="space-y-2">
            {zones.map((z) => <ZoneForm key={z.id} z={{ ...z, fee: centsToInput(z.fee), freeOver: centsToInput(z.freeOver) }} />)}
            <div className="border-t border-border pt-3"><ZoneForm /></div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pickup locations" />
          <CardBody className="space-y-3">{pickups.map((l) => <PickupForm key={l.id} l={l} />)}<PickupForm /></CardBody>
        </Card>
      </div>
    );
  } else if (tab === "payments") body = <Card><CardBody><PaymentsForm p={s.payments} cardAvailable={flutterwaveConfigured()} momoApi={momoConfigured()} /></CardBody></Card>;
  else if (tab === "notifications") body = <Card><CardBody><NotificationsForm n={s.notifications} inv={s.invoice} /></CardBody></Card>;
  else {
    const ch = channelStatus();
    const social = socialConfigured();
    const items = [
      { name: "SMS", ok: ch.SMS !== "log", detail: ch.SMS === "log" ? "Not connected (messages are logged only). Set SMS_PROVIDER=twilio or africastalking." : `Provider: ${ch.SMS}` },
      { name: "WhatsApp", ok: ch.WHATSAPP !== "log", detail: ch.WHATSAPP === "log" ? "Not connected. Set WHATSAPP_PROVIDER=meta (WhatsApp Cloud API) or twilio." : `Provider: ${ch.WHATSAPP}` },
      { name: "Email", ok: ch.EMAIL !== "log", detail: ch.EMAIL === "log" ? "Not connected. Set EMAIL_PROVIDER=smtp or resend." : `Provider: ${ch.EMAIL}` },
      { name: "MTN MoMo API", ok: momoConfigured(), detail: momoConfigured() ? `Target: ${process.env.MTN_MOMO_TARGET_ENV}` : "Optional — manual MoMo transfers work without it." },
      { name: "Flutterwave (cards)", ok: flutterwaveConfigured(), detail: flutterwaveConfigured() ? "Connected" : "Optional — set FLUTTERWAVE_SECRET_KEY." },
      { name: "Facebook Page", ok: social.FACEBOOK, detail: social.FACEBOOK ? "Auto-publishing on" : "Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN." },
      { name: "Instagram", ok: social.INSTAGRAM, detail: social.INSTAGRAM ? "Auto-publishing on" : "Set META_IG_USER_ID (business account linked to the Page)." },
      { name: "X (Twitter)", ok: social.X, detail: social.X ? "Auto-publishing on" : "Set X_ACCESS_TOKEN (OAuth 2.0 user token with tweet.write)." },
    ];
    const hooks = [
      ["Twilio SMS / WhatsApp", appUrl("/api/webhooks/twilio")],
      ["Meta WhatsApp Cloud API", appUrl("/api/webhooks/whatsapp")],
      ["Africa's Talking", appUrl("/api/webhooks/africastalking?token=INBOUND_WEBHOOK_TOKEN")],
      ["MTN MoMo callback", appUrl("/api/webhooks/momo")],
      ["Flutterwave", appUrl("/api/webhooks/flutterwave")],
      ["Job runner (cron, every minute)", appUrl("/api/cron/jobs")],
    ];
    body = (
      <div className="space-y-6">
        <Card>
          <CardHeader title="Connected services" description="Credentials live in server environment variables — never in the database." />
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.name} className="flex items-start gap-3 px-5 py-3 text-sm">
                {i.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success-fg" aria-hidden /> : <CircleDashed className="mt-0.5 h-5 w-5 text-subtle" aria-hidden />}
                <span><span className="font-semibold">{i.name}</span><span className="block text-muted">{i.detail}</span></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Webhook URLs" description="Paste these into each provider's dashboard." />
          <CardBody className="space-y-2">
            {hooks.map(([name, url]) => (
              <div key={name} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="min-w-0"><span className="font-medium">{name}</span><span className="block truncate text-xs text-muted">{url}</span></span>
                <CopyButton text={url!} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    );
  }
  return (
    <>
      <PageHeader title="Settings" description="Business profile, store rules, delivery areas, payment options, notifications and integrations." />
      <Tabs active={tab} tabs={[{ key: "business", label: "Business", href: "/admin/settings" }, { key: "store", label: "Store & delivery", href: "/admin/settings?tab=store" }, { key: "payments", label: "Payments", href: "/admin/settings?tab=payments" }, { key: "notifications", label: "Notifications & invoices", href: "/admin/settings?tab=notifications" }, { key: "integrations", label: "Integrations", href: "/admin/settings?tab=integrations" }]} />
      <div className="mt-6">{body}</div>
    </>
  );
}
