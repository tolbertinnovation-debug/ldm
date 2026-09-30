/**
 * Money helpers. All amounts are integer minor units (cents).
 * Quantities may be fractional (e.g. 2.35 lb) — totals are computed with
 * integer math on thousandths so rounding is exact and half-up.
 */

const SYMBOLS: Record<string, string> = {
  USD: "$",
  LRD: "L$",
  GHS: "GH₵",
  NGN: "₦",
  SLE: "Le",
  XOF: "CFA ",
  EUR: "€",
  GBP: "£",
};

export function currencySymbol(currency: string) {
  return SYMBOLS[currency] ?? `${currency} `;
}

export function formatMoney(cents: number, currency = "USD", opts: { showZeroDecimals?: boolean } = {}) {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const wholeStr = whole.toLocaleString("en-US");
  const showDecimals = opts.showZeroDecimals !== false || fraction !== 0;
  const body = showDecimals ? `${wholeStr}.${String(fraction).padStart(2, "0")}` : wholeStr;
  return `${negative ? "−" : ""}${currencySymbol(currency)}${body}`;
}

/** Compact money for charts and KPI tiles: $1.2k, $3.4M. */
export function formatMoneyCompact(cents: number, currency = "USD") {
  const value = cents / 100;
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const sym = currencySymbol(currency);
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}${sym}${abs.toFixed(abs % 1 === 0 ? 0 : 2)}`;
}

/** Parse a user-entered amount like "1,250.50" or "$12" into cents. Returns null if invalid. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return cleaned.startsWith("-") ? -cents : cents;
}

/** Convert cents to a plain decimal string for form inputs ("12.50"). */
export function centsToInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/** Quantity in thousandths, avoiding float drift (2.35 -> 2350). */
export function toMilli(quantity: number) {
  return Math.round(quantity * 1000);
}

/** Exact, half-up line total for a unit price (cents) × fractional quantity. */
export function lineTotal(unitPriceCents: number, quantity: number) {
  const product = unitPriceCents * toMilli(quantity);
  // Math.round is half-up for positives; mirror for negatives.
  return product >= 0 ? Math.round(product / 1000) : -Math.round(-product / 1000);
}

/** Percentage of an amount, half-up. `percent` may be fractional (7.5). */
export function percentOf(amountCents: number, percent: number) {
  return Math.round((amountCents * Math.round(percent * 100)) / 10_000);
}

export function convert(cents: number, rate: number) {
  return Math.round(cents * rate);
}
