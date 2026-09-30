import { safeEqual } from "@/lib/crypto";
import { confirmFlutterwave } from "@/lib/services/online-payments";

export async function POST(request: Request) {
  const hash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!hash || !safeEqual(request.headers.get("verif-hash") ?? "", hash)) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { data?: { tx_ref?: string } };
  if (body.data?.tx_ref) await confirmFlutterwave(body.data.tx_ref);
  return new Response("OK");
}
