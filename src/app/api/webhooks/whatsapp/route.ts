import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";
import { applyDeliveryStatus, recordInbound } from "@/lib/messaging";

/** Meta WhatsApp Cloud API webhook: {APP_URL}/api/webhooks/whatsapp */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (verify && url.searchParams.get("hub.mode") === "subscribe" && safeEqual(url.searchParams.get("hub.verify_token") ?? "", verify)) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type WaPayload = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        metadata?: { display_phone_number?: string };
        messages?: { from: string; id: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } }[];
        statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
      };
    }[];
  }[];
};

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const raw = await request.text();
  if (!secret) return new Response("Not configured", { status: 503 });
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  if (!safeEqual(expected, request.headers.get("x-hub-signature-256") ?? "")) return new Response("Invalid signature", { status: 403 });

  const payload = JSON.parse(raw) as WaPayload;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v) continue;
      for (const m of v.messages ?? []) {
        const body = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type} message]`;
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        await recordInbound({ channel: "WHATSAPP", from: `+${m.from}`, to: v.metadata?.display_phone_number, body, provider: "meta", providerMessageId: m.id, profileName: name });
      }
      for (const s of v.statuses ?? []) {
        await applyDeliveryStatus(s.id, s.status, s.errors?.[0]?.title ?? null);
      }
    }
  }
  return Response.json({ ok: true });
}
