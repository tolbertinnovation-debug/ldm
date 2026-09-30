import "server-only";

/**
 * Outbound message providers. Each returns a normalised result; network or
 * API errors are reported (not thrown) so the job runner can retry.
 *
 * Configure with environment variables (see .env.example). When a channel's
 * provider is "log", messages are recorded but not actually sent — useful for
 * development and for businesses that have not connected a provider yet.
 */

export type SendResult = { ok: boolean; provider: string; providerMessageId?: string; error?: string; retryable?: boolean };

const TIMEOUT_MS = 15_000;

async function http(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json: json as Record<string, unknown> | null, text };
}

function errorResult(provider: string, err: unknown): SendResult {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, provider, error: message, retryable: true };
}

export function smsProvider() {
  return (process.env.SMS_PROVIDER ?? "log").toLowerCase();
}
export function whatsappProvider() {
  return (process.env.WHATSAPP_PROVIDER ?? "log").toLowerCase();
}
export function emailProvider() {
  return (process.env.EMAIL_PROVIDER ?? "log").toLowerCase();
}

export function channelStatus() {
  return {
    SMS: smsProvider(),
    WHATSAPP: whatsappProvider(),
    EMAIL: emailProvider(),
  };
}

function logSend(channel: string, to: string, body: string): SendResult {
  console.info(`[message:${channel}] → ${to}\n${body}`);
  return { ok: true, provider: "log", providerMessageId: `log_${Date.now().toString(36)}` };
}

// ---------------------------------------------------------------------------
// Twilio (SMS + WhatsApp)
// ---------------------------------------------------------------------------

async function twilioSend(to: string, from: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) return { ok: false, provider: "twilio", error: "Twilio is not configured", retryable: false };
  try {
    const params = new URLSearchParams({ To: to, From: from, Body: body });
    const { res, json } = await http(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!res.ok) {
      return {
        ok: false,
        provider: "twilio",
        error: String(json?.message ?? `HTTP ${res.status}`),
        retryable: res.status >= 500 || res.status === 429,
      };
    }
    return { ok: true, provider: "twilio", providerMessageId: String(json?.sid ?? "") };
  } catch (err) {
    return errorResult("twilio", err);
  }
}

// ---------------------------------------------------------------------------
// Africa's Talking (SMS)
// ---------------------------------------------------------------------------

async function africasTalkingSend(to: string, body: string): Promise<SendResult> {
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if (!username || !apiKey) return { ok: false, provider: "africastalking", error: "Africa's Talking is not configured", retryable: false };
  const base = username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  try {
    const params = new URLSearchParams({ username, to, message: body });
    if (process.env.AT_SENDER_ID) params.set("from", process.env.AT_SENDER_ID);
    const { res, json } = await http(`${base}/version1/messaging`, {
      method: "POST",
      headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const recipients = (json?.SMSMessageData as { Recipients?: { status: string; statusCode: number; messageId: string }[] })
      ?.Recipients;
    const r = recipients?.[0];
    if (!res.ok || !r || ![100, 101, 102].includes(Number(r.statusCode))) {
      return {
        ok: false,
        provider: "africastalking",
        error: r?.status ?? `HTTP ${res.status}`,
        retryable: res.status >= 500,
      };
    }
    return { ok: true, provider: "africastalking", providerMessageId: r.messageId };
  } catch (err) {
    return errorResult("africastalking", err);
  }
}

// ---------------------------------------------------------------------------
// Meta WhatsApp Cloud API
// ---------------------------------------------------------------------------

async function metaWhatsAppSend(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  if (!token || !phoneId) return { ok: false, provider: "meta", error: "WhatsApp Cloud API is not configured", retryable: false };
  try {
    const { res, json } = await http(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/\D/g, ""),
        type: "text",
        text: { preview_url: true, body },
      }),
    });
    if (!res.ok) {
      const error = (json?.error as { message?: string; code?: number } | undefined) ?? {};
      return {
        ok: false,
        provider: "meta",
        // 131047: outside the 24h customer-service window — needs an approved template.
        error: error.code === 131047 ? "Outside WhatsApp 24-hour window; use an approved template or SMS." : (error.message ?? `HTTP ${res.status}`),
        retryable: res.status >= 500 || res.status === 429,
      };
    }
    const id = (json?.messages as { id: string }[] | undefined)?.[0]?.id;
    return { ok: true, provider: "meta", providerMessageId: id };
  } catch (err) {
    return errorResult("meta", err);
  }
}

// ---------------------------------------------------------------------------
// Email: SMTP (nodemailer) or Resend
// ---------------------------------------------------------------------------

async function smtpSend(to: string, subject: string, text: string, html: string, headers?: Record<string, string>): Promise<SendResult> {
  if (!process.env.SMTP_HOST) return { ok: false, provider: "smtp", error: "SMTP is not configured", retryable: false };
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    const info = await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject, text, html, headers });
    return { ok: true, provider: "smtp", providerMessageId: info.messageId };
  } catch (err) {
    return errorResult("smtp", err);
  }
}

async function resendSend(to: string, subject: string, text: string, html: string, headers?: Record<string, string>): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, provider: "resend", error: "Resend is not configured", retryable: false };
  try {
    const { res, json } = await http("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html, headers }),
    });
    if (!res.ok) {
      return { ok: false, provider: "resend", error: String(json?.message ?? `HTTP ${res.status}`), retryable: res.status >= 500 || res.status === 429 };
    }
    return { ok: true, provider: "resend", providerMessageId: String(json?.id ?? "") };
  } catch (err) {
    return errorResult("resend", err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendSms(to: string, body: string): Promise<SendResult> {
  switch (smsProvider()) {
    case "twilio":
      return twilioSend(to, process.env.TWILIO_SMS_FROM ?? "", body);
    case "africastalking":
      return africasTalkingSend(to, body);
    default:
      return logSend("sms", to, body);
  }
}

export async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  switch (whatsappProvider()) {
    case "meta":
      return metaWhatsAppSend(to, body);
    case "twilio":
      return twilioSend(`whatsapp:${to}`, `whatsapp:${(process.env.TWILIO_WHATSAPP_FROM ?? "").replace(/^whatsapp:/, "")}`, body);
    default:
      return logSend("whatsapp", to, body);
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
  headers?: Record<string, string>,
): Promise<SendResult> {
  switch (emailProvider()) {
    case "smtp":
      return smtpSend(to, subject, text, html, headers);
    case "resend":
      return resendSend(to, subject, text, html, headers);
    default:
      return logSend("email", to, `Subject: ${subject}\n\n${text}`);
  }
}
