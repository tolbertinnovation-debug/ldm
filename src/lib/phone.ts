/**
 * Phone number normalisation to E.164.
 * Defaults to Liberia (+231) where numbers are written locally as 077…/088…/055….
 */

export const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE ?? "231";

export function normalizePhone(input: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith(countryCode) && digits.length > countryCode.length + 6) {
    // 231770000000 — international without plus
  } else if (digits.startsWith("0")) {
    digits = countryCode + digits.slice(1);
  } else {
    digits = countryCode + digits;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function isValidPhone(input: string | null | undefined) {
  return normalizePhone(input) !== null;
}

/** Human display: +231 77 012 3456 */
export function formatPhone(e164: string | null | undefined) {
  if (!e164) return "";
  if (e164.startsWith("+231") && e164.length === 13) {
    const n = e164.slice(4);
    return `+231 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  if (e164.startsWith("+1") && e164.length === 12) {
    const n = e164.slice(2);
    return `+1 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return e164;
}

/** wa.me link for click-to-chat (digits only). */
export function whatsappLink(e164: string, text?: string) {
  const digits = e164.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Mobile network hint for Liberian numbers (useful for mobile money routing). */
export function liberianNetwork(e164: string | null | undefined): "ORANGE" | "LONESTAR_MTN" | null {
  if (!e164 || !e164.startsWith("+231")) return null;
  const prefix = e164.slice(4, 6);
  if (prefix === "77" || prefix === "07") return "ORANGE";
  if (prefix === "88" || prefix === "55") return "LONESTAR_MTN";
  return null;
}
