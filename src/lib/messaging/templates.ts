/**
 * Message templates. Bodies use {{placeholders}}; unknown placeholders render
 * as empty strings. Defaults are seeded into the DB and editable in the admin.
 */

export type TemplateDefinition = { key: string; name: string; description: string; subject: string; body: string };

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  {
    key: "order.placed",
    name: "Order received",
    description: "Sent to the customer right after they place an order.",
    subject: "We received your order {{orderNumber}}",
    body: "Hi {{firstName}}, thank you for your order {{orderNumber}} from {{business}}! Total: {{total}}. We will confirm shortly. Track it here: {{trackUrl}}",
  },
  {
    key: "order.confirmed",
    name: "Order confirmed",
    description: "Sent when staff confirm the order.",
    subject: "Order {{orderNumber}} confirmed",
    body: "Hi {{firstName}}, your order {{orderNumber}} is confirmed. {{fulfilmentLine}} Track it: {{trackUrl}}",
  },
  {
    key: "order.ready",
    name: "Ready for pickup",
    description: "Sent when a pickup order is ready.",
    subject: "Order {{orderNumber}} is ready for pickup",
    body: "Good news {{firstName}}! Order {{orderNumber}} is ready for pickup at {{pickupLocation}}. Amount due: {{balance}}.",
  },
  {
    key: "order.out_for_delivery",
    name: "Out for delivery",
    description: "Sent when the driver leaves with the order.",
    subject: "Order {{orderNumber}} is on the way",
    body: "Hi {{firstName}}, order {{orderNumber}} is on the way with {{driverName}} ({{driverPhone}}). Amount to pay on delivery: {{balance}}. Track: {{trackUrl}}",
  },
  {
    key: "order.completed",
    name: "Order completed",
    description: "Sent when the order is delivered or collected.",
    subject: "Thank you for your order {{orderNumber}}",
    body: "Thank you {{firstName}}! Order {{orderNumber}} is complete. We hope you enjoy it — reply anytime to order again from {{business}}.",
  },
  {
    key: "order.cancelled",
    name: "Order cancelled",
    description: "Sent when an order is cancelled.",
    subject: "Order {{orderNumber}} cancelled",
    body: "Hi {{firstName}}, order {{orderNumber}} has been cancelled. {{reason}} Questions? Call us on {{businessPhone}}.",
  },
  {
    key: "payment.received",
    name: "Payment received",
    description: "Receipt sent when a payment is recorded.",
    subject: "Payment received — {{amount}}",
    body: "Hi {{firstName}}, we received your payment of {{amount}} ({{method}}) for {{documentNumber}}. Balance: {{balance}}. Thank you!",
  },
  {
    key: "invoice.sent",
    name: "Invoice",
    description: "Sent with an invoice link.",
    subject: "Invoice {{invoiceNumber}} from {{business}}",
    body: "Hi {{firstName}}, here is invoice {{invoiceNumber}} for {{total}}, due {{dueDate}}. View it here: {{invoiceUrl}}",
  },
  {
    key: "booking.received",
    name: "Booking request received",
    description: "Sent when a customer requests a service booking.",
    subject: "Booking {{bookingNumber}} received",
    body: "Hi {{firstName}}, we received your request for {{service}} (ref {{bookingNumber}}). Our team will call you to confirm the date.",
  },
  {
    key: "booking.confirmed",
    name: "Booking confirmed",
    description: "Sent when staff confirm a booking.",
    subject: "Booking {{bookingNumber}} confirmed",
    body: "Hi {{firstName}}, your booking for {{service}} is confirmed for {{when}}. See you soon! — {{business}}",
  },
  {
    key: "auth.otp",
    name: "Sign-in code",
    description: "One-time sign-in code.",
    subject: "Your {{business}} sign-in code",
    body: "Your {{business}} code is {{code}}. It expires in 10 minutes. Never share this code.",
  },
  {
    key: "admin.new_order",
    name: "Staff alert: new order",
    description: "Sent to the business phone/email when a new order arrives.",
    subject: "New order {{orderNumber}} — {{total}}",
    body: "New {{fulfilment}} order {{orderNumber}} from {{customerName}} ({{customerPhone}}): {{total}}. {{adminUrl}}",
  },
  {
    key: "admin.new_booking",
    name: "Staff alert: new booking",
    description: "Sent to the business when a service booking is requested.",
    subject: "New booking {{bookingNumber}}",
    body: "New booking {{bookingNumber}}: {{service}} for {{customerName}} ({{customerPhone}}). {{adminUrl}}",
  },
  {
    key: "admin.low_stock",
    name: "Staff alert: low stock",
    description: "Sent when a product falls to its low-stock threshold.",
    subject: "Low stock: {{product}}",
    body: "Low stock alert: {{product}} is down to {{stock}}. Restock or update availability. {{adminUrl}}",
  },
];

export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>) {
  return body
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      const v = vars[key];
      return v === null || v === undefined ? "" : String(v);
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function firstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}

/** SMS segments (GSM-7 160 chars / UCS-2 70 chars) — shown in the composer. */
export function smsSegments(text: string) {
  const gsm = /^[\x0A\x0D\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  if (text.length <= single) return { segments: text.length ? 1 : 0, encoding: gsm ? "GSM-7" : "Unicode" };
  return { segments: Math.ceil(text.length / multi), encoding: gsm ? "GSM-7" : "Unicode" };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Wraps plain text in a simple, mobile-friendly branded email. */
export function emailHtml(opts: { business: string; body: string; unsubscribeUrl?: string | null; footer?: string }) {
  const paragraphs = escapeHtml(opts.body)
    .split(/\n{2,}/)
    .map((p) =>
      p
        .replace(/\n/g, "<br>")
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1f6b3a">$1</a>'),
    )
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${p}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#1f5130;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:700">${escapeHtml(opts.business)}</td></tr>
<tr><td style="padding:24px;font-size:15px">${paragraphs}</td></tr>
<tr><td style="padding:16px 24px;background:#faf8f3;color:#78716c;font-size:12px">${escapeHtml(opts.footer ?? "")}${
    opts.unsubscribeUrl ? ` · <a href="${opts.unsubscribeUrl}" style="color:#78716c">Unsubscribe</a>` : ""
  }</td></tr>
</table></td></tr></table></body></html>`;
}
