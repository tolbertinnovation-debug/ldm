/** Date formatting in the business time zone (safe for client and server). */
export const DISPLAY_TZ = process.env.NEXT_PUBLIC_TIMEZONE ?? "Africa/Monrovia";

function toDate(d: Date | string | number) {
  return d instanceof Date ? d : new Date(typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d);
}

export function formatDate(d: Date | string | number | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (d === null || d === undefined || d === "") return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TZ, ...opts }).format(toDate(d));
}

export function formatDateTime(d: Date | string | number | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(toDate(d));
}

export function formatTime(d: Date | string | number | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(toDate(d));
}

export function timeAgo(d: Date | string | number | null | undefined, now = Date.now()) {
  if (!d) return "—";
  const diff = Math.round((now - toDate(d).getTime()) / 1000);
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (abs < 60) return diff >= 0 ? "just now" : "in a moment";
  if (abs < 3600) return `${Math.floor(abs / 60)}m ${suffix}`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ${suffix}`;
  if (abs < 86400 * 7) return `${Math.floor(abs / 86400)}d ${suffix}`;
  return formatDate(d);
}

export function formatPercent(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatNumber(n: number, digits = 0) {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function todayInTz() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TZ }).format(new Date());
}
