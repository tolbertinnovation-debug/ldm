import { asc, desc, eq } from "drizzle-orm";
import { Share2 } from "lucide-react";
import { db } from "@/lib/db";
import { campaigns, products, socialPosts } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { appUrl } from "@/lib/request";
import { formatDateTime } from "@/lib/format";
import { shareLinks, socialConfigured } from "@/lib/social";
import { SOCIAL_PLATFORM_LABELS, SOCIAL_STATUS_META, type SocialPlatform } from "@/lib/constants";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { CopyButton, SocialComposer } from "@/components/admin/marketing-forms";
import { socialOpAction } from "../campaigns/actions";

export const metadata = { title: "Social media" };

export default async function SocialPage() {
  await requireStaff("marketing:manage");
  const [posts, prods, camps] = await Promise.all([
    db.select().from(socialPosts).orderBy(desc(socialPosts.createdAt)).limit(40),
    db.select({ id: products.id, name: products.name, slug: products.slug, images: products.images }).from(products).where(eq(products.status, "ACTIVE")).orderBy(asc(products.name)),
    db.select({ id: campaigns.id, name: campaigns.name, utm: campaigns.utmCampaign }).from(campaigns).orderBy(desc(campaigns.createdAt)),
  ]);
  const configured = socialConfigured();
  const base = appUrl("");
  return (
    <>
      <PageHeader title="Social media" description="Compose once, publish to Facebook, Instagram and X, or share to WhatsApp Status and groups — with tracked links." />
      {!configured.FACEBOOK && <Alert tone="info" className="mb-4" title="Manual sharing mode">Connect a Facebook Page / Instagram business account (Meta Graph API token) to auto-publish. Until then, each post gives you one-tap share buttons and copy-ready text.</Alert>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="New post" />
          <CardBody><SocialComposer baseUrl={base} configured={configured} products={prods.map((p) => ({ value: p.id, label: p.name, slug: p.slug, image: p.images[0] ?? null }))} campaigns={camps.map((c) => ({ value: c.id, label: c.name, utm: c.utm }))} /></CardBody>
        </Card>
        <div className="space-y-3">
          {posts.length === 0 && <Card><EmptyState icon={<Share2 className="h-6 w-6" />} title="No posts yet" /></Card>}
          {posts.map((p) => {
            const share = shareLinks(p.content, p.link);
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-1">{p.platforms.map((pl) => {
                    const r = p.results[pl];
                    return <Badge key={pl} tone={r?.ok ? "success" : r && r.error !== "manual" ? "danger" : "neutral"}>{SOCIAL_PLATFORM_LABELS[pl as SocialPlatform]}{r?.error === "manual" ? " · manual" : ""}</Badge>;
                  })}</div>
                  <StatusBadge status={p.status} meta={SOCIAL_STATUS_META} />
                </div>
                <p className="mt-3 whitespace-pre-line text-sm">{p.content}</p>
                {p.imageUrl && <img src={p.imageUrl} alt="" className="mt-3 max-h-48 rounded-xl object-cover" loading="lazy" />}
                {Object.entries(p.results).filter(([, r]) => r.error && r.error !== "manual").map(([k, r]) => <p key={k} className="mt-2 text-xs text-danger">{k}: {r.error}</p>)}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
                  <span className="mr-auto text-xs text-muted">{p.status === "SCHEDULED" ? `Scheduled ${formatDateTime(p.scheduledAt)}` : p.publishedAt ? `Published ${formatDateTime(p.publishedAt)}` : `Created ${formatDateTime(p.createdAt)}`}</span>
                  <CopyButton text={p.link ? `${p.content}\n\n${p.link}` : p.content} label="Copy text" />
                  <a href={share.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366]/15 px-2.5 py-1 text-xs font-semibold text-[#128C4B]">WhatsApp</a>
                  {share.facebook && <a href={share.facebook} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-info-soft px-2.5 py-1 text-xs font-semibold text-info-fg">Facebook</a>}
                  <a href={share.x} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold">X</a>
                  {(p.status === "DRAFT" || p.status === "FAILED" || p.status === "PARTIAL") && <ActionButton action={socialOpAction} fields={{ id: p.id, op: "publish" }} variant="primary">Publish</ActionButton>}
                  {p.status !== "PUBLISHED" && <ActionButton action={socialOpAction} fields={{ id: p.id, op: "mark-posted" }} variant="ghost">Mark posted</ActionButton>}
                  <ActionButton action={socialOpAction} fields={{ id: p.id, op: "delete" }} variant="ghost" confirm="Delete this post?">Delete</ActionButton>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
