import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";
import { applyDeliveryStatus, recordInbound } from "@/lib/messaging";
import { appUrl } from "@/lib/request";

/**
 * Twilio webhook for inbound SMS/WhatsApp and delivery status callbacks.
 * Configure the Messaging webhook URL as {APP_URL}/api/webhooks/twilio.
 */
export async function POST(request: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new Response("Not configured", { status: 503 });
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  // Validate X-Twilio-Signature: HMAC-SHA1(url + sorted key/value pairs).
  const url = appUrl("/api/webhooks/twilio");
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  if (!safeEqual(expected, request.headers.get("x-twilio-signature") ?? "")) return new Response("Invalid signature", { status: 403 });

  if (params.MessageStatus && params.MessageSid && !params.Body) {
    await applyDeliveryStatus(params.MessageSid, params.MessageStatus, params.ErrorMessage ?? null);
  } else if (params.From && params.Body !== undefined) {
    const whatsapp = params.From.startsWith("whatsapp:");
    await recordInbound({
      channel: whatsapp ? "WHATSAPP" : "SMS",
      from: params.From.replace(/^whatsapp:/, ""),
      to: params.To?.replace(/^whatsapp:/, ""),
      body: params.Body,
      provider: "twilio",
      providerMessageId: params.MessageSid,
      profileName: params.ProfileName ?? null,
    });
  }
  return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
