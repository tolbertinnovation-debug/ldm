import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialPosts, type SocialResult } from "@/lib/db/schema";
import type { SocialPlatform } from "@/lib/constants";

/**
 * Social publishing. Facebook Pages, Instagram (business accounts) and X are
 * published through their APIs when credentials are configured; otherwise
 * (and always for WhatsApp Status) the post is marked "manual" and staff use
 * the one-tap share links in the admin.
 */

const TIMEOUT = 20_000;
const graph = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;

export function socialConfigured(): Record<SocialPlatform, boolean> {
  return {
    FACEBOOK: !!(process.env.META_PAGE_ID && process.env.META_PAGE_ACCESS_TOKEN),
    INSTAGRAM: !!(process.env.META_IG_USER_ID && process.env.META_PAGE_ACCESS_TOKEN),
    X: !!process.env.X_ACCESS_TOKEN,
    WHATSAPP: false,
  };
}

async function postJson(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message ?? (json.detail as string | undefined) ?? `HTTP ${res.status}`;
    throw new Error(err);
  }
  return json;
}

async function publishFacebook(text: string, link: string | null, imageUrl: string | null) {
  const token = process.env.META_PAGE_ACCESS_TOKEN!;
  const page = process.env.META_PAGE_ID!;
  if (imageUrl) {
    const json = await postJson(`${graph()}/${page}/photos`, { url: imageUrl, caption: link ? `${text}\n\n${link}` : text, access_token: token });
    const id = String(json.post_id ?? json.id);
    return { id, url: `https://www.facebook.com/${id}` };
  }
  const json = await postJson(`${graph()}/${page}/feed`, { message: text, ...(link ? { link } : {}), access_token: token });
  const id = String(json.id);
  return { id, url: `https://www.facebook.com/${id}` };
}

async function publishInstagram(text: string, link: string | null, imageUrl: string | null) {
  if (!imageUrl) throw new Error("Instagram posts need an image.");
  const token = process.env.META_PAGE_ACCESS_TOKEN!;
  const ig = process.env.META_IG_USER_ID!;
  const caption = link ? `${text}\n\nOrder: ${link}` : text;
  const container = await postJson(`${graph()}/${ig}/media`, { image_url: imageUrl, caption, access_token: token });
  const published = await postJson(`${graph()}/${ig}/media_publish`, { creation_id: container.id, access_token: token });
  return { id: String(published.id), url: undefined };
}

async function publishX(text: string, link: string | null) {
  const full = link ? `${text} ${link}` : text;
  const json = await postJson("https://api.x.com/2/tweets", { text: full.slice(0, 280) }, { Authorization: `Bearer ${process.env.X_ACCESS_TOKEN}` });
  const id = String((json.data as { id?: string } | undefined)?.id ?? "");
  return { id, url: id ? `https://x.com/i/status/${id}` : undefined };
}

/** Publishes a post to each selected platform and records per-platform results. */
export async function publishSocialPost(postId: string) {
  const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, postId));
  if (!post || post.status === "PUBLISHED") return;
  if (post.status === "SCHEDULED" && post.scheduledAt && post.scheduledAt.getTime() > Date.now() + 60_000) return; // rescheduled
  if (post.status === "DRAFT") return; // unscheduled after job was queued

  await db.update(socialPosts).set({ status: "PUBLISHING" }).where(eq(socialPosts.id, postId));
  const configured = socialConfigured();
  const results: Record<string, SocialResult> = { ...post.results };
  const at = new Date().toISOString();

  for (const platform of post.platforms as SocialPlatform[]) {
    if (results[platform]?.ok) continue;
    if (!configured[platform]) {
      results[platform] = { ok: false, error: "manual", at };
      continue;
    }
    try {
      const r =
        platform === "FACEBOOK"
          ? await publishFacebook(post.content, post.link, post.imageUrl)
          : platform === "INSTAGRAM"
            ? await publishInstagram(post.content, post.link, post.imageUrl)
            : await publishX(post.content, post.link);
      results[platform] = { ok: true, id: r.id, url: r.url, at };
    } catch (err) {
      results[platform] = { ok: false, error: err instanceof Error ? err.message : String(err), at };
    }
  }

  const values = Object.values(results);
  const apiResults = values.filter((r) => r.error !== "manual");
  const anyOk = values.some((r) => r.ok);
  const allOk = apiResults.length > 0 && apiResults.every((r) => r.ok) && apiResults.length === values.length;
  const status = allOk ? "PUBLISHED" : anyOk ? "PARTIAL" : apiResults.length === 0 ? "PUBLISHED" : "FAILED";
  await db
    .update(socialPosts)
    .set({ status, results, publishedAt: anyOk || apiResults.length === 0 ? new Date() : null })
    .where(eq(socialPosts.id, postId));
}

/** One-tap share links for manual posting (works without any API keys). */
export function shareLinks(text: string, link: string | null) {
  const full = link ? `${text}\n\n${link}` : text;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(full)}`,
    facebook: link ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}` : null,
    x: `https://x.com/intent/post?text=${encodeURIComponent(text)}${link ? `&url=${encodeURIComponent(link)}` : ""}`,
    telegram: link ? `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}` : null,
  };
}

export function utmLink(base: string, path: string, source: string, campaign: string, medium = "social") {
  const url = new URL(path, base);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", medium);
  url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}
