import { Beef, Fish, GraduationCap, Ham, Leaf, PiggyBank, Sprout, Wheat, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { UNIT_LABELS, type SalesUnit } from "@/lib/constants";

export const CATEGORY_ICONS: Record<string, { icon: LucideIcon; from: string; to: string; fg: string }> = {
  piggy: { icon: PiggyBank, from: "#fde2e0", to: "#f7c3bd", fg: "#9c3b2e" },
  beef: { icon: Beef, from: "#f9dcd2", to: "#eeb7a3", fg: "#8a3419" },
  ham: { icon: Ham, from: "#fde9d0", to: "#f7cf9c", fg: "#8f4d0c" },
  fish: { icon: Fish, from: "#dbeafb", to: "#b6d4f5", fg: "#1f4f96" },
  leaf: { icon: Leaf, from: "#dcf2e3", to: "#b3e0c1", fg: "#17613a" },
  wheat: { icon: Wheat, from: "#fbf0cf", to: "#f3dd98", fg: "#7a5a07" },
  graduation: { icon: GraduationCap, from: "#e6e3fb", to: "#c9c2f3", fg: "#46369a" },
};

export function categoryVisual(icon: string | null | undefined) {
  return CATEGORY_ICONS[icon ?? ""] ?? { icon: Sprout, from: "#e3f1e6", to: "#c3e2cb", fg: "#1d5531" };
}

/** Product photo, or a clean illustrated tile based on the product's category. */
export function ProductImage({
  src,
  alt,
  icon,
  className,
  size = "md",
}: {
  src?: string | null;
  alt: string;
  icon?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  if (src) {
    return <img src={src} alt={alt} loading="lazy" decoding="async" className={cn("h-full w-full object-cover", className)} />;
  }
  const v = categoryVisual(icon);
  const Icon = v.icon;
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn("relative flex h-full w-full items-center justify-center overflow-hidden", className)}
      style={{ background: `linear-gradient(135deg, ${v.from}, ${v.to})` }}
    >
      <svg className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
        <defs>
          <pattern id={`dots-${icon ?? "default"}`} width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill={v.fg} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#dots-${icon ?? "default"})`} />
      </svg>
      <Icon
        aria-hidden
        strokeWidth={1.4}
        className={cn("relative drop-shadow-sm", size === "sm" ? "h-7 w-7" : size === "lg" ? "h-28 w-28" : "h-14 w-14")}
        style={{ color: v.fg }}
      />
    </div>
  );
}

export function Price({
  cents,
  currency,
  unit,
  compareAt,
  secondary,
  className,
  size = "md",
}: {
  cents: number;
  currency: string;
  unit?: string;
  compareAt?: number | null;
  secondary?: { currency: string; rate: number } | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const u = unit ? UNIT_LABELS[unit as SalesUnit]?.short : null;
  return (
    <div className={cn("leading-tight", className)}>
      <span className={cn("tabular font-bold text-fg", size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-[17px]")}>
        {cents > 0 ? formatMoney(cents, currency) : "Quote"}
      </span>
      {u && cents > 0 && <span className={cn("text-muted", size === "lg" ? "text-base" : "text-xs")}> / {u}</span>}
      {compareAt && compareAt > cents && (
        <span className={cn("ml-2 tabular text-subtle line-through", size === "lg" ? "text-base" : "text-xs")}>{formatMoney(compareAt, currency)}</span>
      )}
      {secondary && cents > 0 && (
        <span className={cn("block tabular text-muted", size === "lg" ? "mt-1 text-sm" : "text-[11px]")}>
          ≈ {formatMoney(Math.round(cents * secondary.rate), secondary.currency, { showZeroDecimals: false })}
        </span>
      )}
    </div>
  );
}

export function SocialIcon({ name, className }: { name: "facebook" | "instagram" | "x" | "tiktok" | "youtube" | "whatsapp"; className?: string }) {
  const paths: Record<string, string> = {
    facebook: "M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.2-1.4 1.5-1.4h1.5V4.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.3H8v3h2.6V21h2.9Z",
    instagram: "M12 7.4A4.6 4.6 0 1 0 12 16.6 4.6 4.6 0 0 0 12 7.4Zm0 7.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm4.8-8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM12 3c-2.4 0-2.7 0-3.7.1-3.3.2-5 1.9-5.2 5.2C3 9.3 3 9.6 3 12s0 2.7.1 3.7c.2 3.3 1.9 5 5.2 5.2 1 .1 1.3.1 3.7.1s2.7 0 3.7-.1c3.3-.2 5-1.9 5.2-5.2.1-1 .1-1.3.1-3.7s0-2.7-.1-3.7c-.2-3.3-1.9-5-5.2-5.2C14.7 3 14.4 3 12 3Z",
    x: "M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z",
    tiktok: "M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 5 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.3-1.6Z",
    youtube: "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z",
    whatsapp: "M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Zm0 17.3a7.8 7.8 0 0 1-4-1.1l-.3-.2-2.8.8.8-2.8-.2-.3A7.8 7.8 0 1 1 12 19.8Zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.4 6.4 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.8 2 4.6 4.6 0 0 0 1 2.5 10.6 10.6 0 0 0 4.1 3.6c1.5.6 2.1.7 2.8.6a2.4 2.4 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3Z",
  };
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} fill="currentColor" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}
