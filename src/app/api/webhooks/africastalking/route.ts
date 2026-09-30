import { safeEqual } from "@/lib/crypto";
import { applyDeliveryStatus, recordInbound } from "@/lib/messaging";

/**
 * Africa's Talking callbacks. AT does not sign requests, so the URL carries a
 * secret: {APP_URL}/api/webhooks/africastalking?token=INBOUND_WEBHOOK_TOKEN
 */
export async function POST(request: Request) {
  const expected = process.env.INBOUND_WEBHOOK_TOKEN;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!expected || !safeEqual(token, expected)) return new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const get = (k: string) => (form.get(k) === null ? undefined : String(form.get(k)));
  if (get("status") && get("id") && !get("text")) {
    await applyDeliveryStatus(get("id")!, get("status") === "Success" ? "delivered" : get("status") === "Failed" || get("status") === "Rejected" ? "failed" : "sent", get("failureReason") ?? null);
  } else if (get("from") && get("text") !== undefined) {
    await recordInbound({ channel: "SMS", from: get("from")!, to: get("to"), body: get("text")!, provider: "africastalking", providerMessageId: get("id") ?? null });
  }
  return new Response("OK");
}
