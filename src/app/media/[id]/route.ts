import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";

// Serves uploaded images from Postgres. URLs are immutable (new upload => new id).
export async function GET(request: Request, ctx: RouteContext<"/media/[id]">) {
  const { id } = await ctx.params;
  const clean = id.replace(/\.\w+$/, "");
  if (!/^[0-9a-f-]{36}$/i.test(clean)) return new Response("Not found", { status: 404 });
  const thumb = new URL(request.url).searchParams.has("thumb");
  const [row] = await db
    .select({ data: thumb ? media.thumbData : media.data, full: media.data, contentType: media.contentType })
    .from(media)
    .where(eq(media.id, clean));
  if (!row) return new Response("Not found", { status: 404 });
  const body = row.data ?? row.full;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": row.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
