import "server-only";

/**
 * Online payment gateways. Manual methods (cash, Orange Money / MoMo transfer
 * with a transaction ID, bank transfer) need no gateway and always work.
 *
 * - MTN MoMo Collections API: pushes a payment prompt to the customer's phone.
 * - Flutterwave Standard: hosted card checkout.
 */

const TIMEOUT = 20_000;

export function momoConfigured() {
  return !!(process.env.MTN_MOMO_SUBSCRIPTION_KEY && process.env.MTN_MOMO_API_USER && process.env.MTN_MOMO_API_KEY);
}

export function flutterwaveConfigured() {
  return !!process.env.FLUTTERWAVE_SECRET_KEY;
}

function momoBase() {
  return (process.env.MTN_MOMO_BASE_URL ?? "https://sandbox.momodeveloper.mtn.com").replace(/\/+$/, "");
}

async function momoToken() {
  const res = await fetch(`${momoBase()}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.MTN_MOMO_API_USER}:${process.env.MTN_MOMO_API_KEY}`).toString("base64")}`,
      "Ocp-Apim-Subscription-Key": process.env.MTN_MOMO_SUBSCRIPTION_KEY!,
    },
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MoMo token error: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Sends a "request to pay" prompt. Returns the reference id to poll. */
export async function momoRequestToPay(input: { amount: string; currency: string; phone: string; externalId: string; note: string; callbackUrl?: string }) {
  const token = await momoToken();
  const referenceId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Reference-Id": referenceId,
    "X-Target-Environment": process.env.MTN_MOMO_TARGET_ENV ?? "sandbox",
    "Ocp-Apim-Subscription-Key": process.env.MTN_MOMO_SUBSCRIPTION_KEY!,
    "Content-Type": "application/json",
  };
  if (input.callbackUrl?.startsWith("https://")) headers["X-Callback-Url"] = input.callbackUrl;
  const res = await fetch(`${momoBase()}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      externalId: input.externalId,
      payer: { partyIdType: "MSISDN", partyId: input.phone.replace(/\D/g, "") },
      payerMessage: input.note.slice(0, 160),
      payeeNote: input.note.slice(0, 160),
    }),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`MoMo request failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return referenceId;
}

export async function momoStatus(referenceId: string): Promise<{ status: "PENDING" | "SUCCESSFUL" | "FAILED"; transactionId?: string; reason?: string }> {
  const token = await momoToken();
  const res = await fetch(`${momoBase()}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Target-Environment": process.env.MTN_MOMO_TARGET_ENV ?? "sandbox",
      "Ocp-Apim-Subscription-Key": process.env.MTN_MOMO_SUBSCRIPTION_KEY!,
    },
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MoMo status error: HTTP ${res.status}`);
  const json = (await res.json()) as { status: string; financialTransactionId?: string; reason?: string | { message?: string } };
  const status = json.status === "SUCCESSFUL" ? "SUCCESSFUL" : json.status === "FAILED" || json.status === "REJECTED" || json.status === "TIMEOUT" ? "FAILED" : "PENDING";
  return {
    status,
    transactionId: json.financialTransactionId,
    reason: typeof json.reason === "string" ? json.reason : json.reason?.message,
  };
}

export async function flutterwaveCheckout(input: {
  txRef: string;
  amount: number; // major units
  currency: string;
  redirectUrl: string;
  customer: { email?: string | null; phone: string; name: string };
  title: string;
}) {
  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: input.txRef,
      amount: input.amount,
      currency: input.currency,
      redirect_url: input.redirectUrl,
      customer: { email: input.customer.email || "customer@example.com", phonenumber: input.customer.phone, name: input.customer.name },
      customizations: { title: input.title },
    }),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: { link?: string } } | null;
  if (!res.ok || json?.status !== "success" || !json.data?.link) throw new Error(json?.message ?? `Flutterwave error: HTTP ${res.status}`);
  return json.data.link;
}

export async function flutterwaveVerify(txRef: string) {
  const res = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, {
    headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    data?: { status?: string; amount?: number; currency?: string; id?: number; tx_ref?: string };
  } | null;
  if (!res.ok || !json?.data) return { ok: false as const };
  return {
    ok: json.data.status === "successful",
    amount: json.data.amount ?? 0,
    currency: json.data.currency ?? "",
    transactionId: json.data.id ? String(json.data.id) : undefined,
  };
}
