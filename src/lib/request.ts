import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP. Behind a proxy, the left-most X-Forwarded-For entry is the client. */
export async function clientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function userAgent() {
  const h = await headers();
  return h.get("user-agent")?.slice(0, 300) ?? null;
}

/** Absolute base URL for links in messages and payment redirects. */
export function appUrl(path = "") {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
