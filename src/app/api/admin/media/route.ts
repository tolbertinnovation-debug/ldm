import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { apiUser } from "@/lib/api-guard";
import { rateLimit } from "@/lib/rate-limit";

const MAX = 3 * 1024 * 1024;

function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** Upload an image (client pre-resizes to ≤1600px and sends a 480px thumbnail). */
export async function POST(request: Request) {
  const guard = await apiUser(request, ["products:manage", "marketing:manage", "expenses:manage", "settings:manage"]);
  if ("error" in guard) return guard.error;
  const limited = await rateLimit(`upload:${guard.user.id}`, 60, 3600);
  if (!limited.ok) return Response.json({ error: "Too many uploads" }, { status: 429 });

  const form = await request.formData();
  const file = form.get("file");
  const thumb = form.get("thumb");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "Image is too large (max 3 MB)" }, { status: 413 });
  const data = Buffer.from(await file.arrayBuffer());
  const type = sniff(data);
  if (!type) return Response.json({ error: "Only JPEG, PNG or WebP images are allowed" }, { status: 415 });
  let thumbData: Buffer | null = null;
  if (thumb instanceof File && thumb.size <= MAX) {
    const t = Buffer.from(await thumb.arrayBuffer());
    if (sniff(t) === type) thumbData = t;
  }
  const [row] = await db
    .insert(media)
    .values({
      filename: file.name.replace(/[^\w.\-]/g, "_").slice(0, 120) || "image",
      contentType: type,
      size: data.length,
      width: Number(form.get("width")) || null,
      height: Number(form.get("height")) || null,
      data,
      thumbData,
      alt: String(form.get("alt") ?? "").slice(0, 200) || null,
      createdById: guard.user.id,
    })
    .returning({ id: media.id });
  return Response.json({ id: row!.id, url: `/media/${row!.id}` });
}
