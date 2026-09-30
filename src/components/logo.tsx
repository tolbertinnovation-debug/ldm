import { cn } from "./ui";

/** REAP mark: a sprout rising from a furrow inside a rounded tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-9 w-9", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#1d5531" />
      <path d="M20 30V18" stroke="#fdd68a" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M20 21c0-5 3.5-8.5 9-8.5 0 5.2-3.6 8.5-9 8.5Z" fill="#7dbd90" />
      <path d="M20 24c0-4.4-3-7.4-7.8-7.4 0 4.5 3.1 7.4 7.8 7.4Z" fill="#aed8b9" />
      <path d="M9 31.5c3.6-1.6 7.2-2.4 11-2.4s7.4.8 11 2.4" stroke="#f9a224" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ name, className, tagline }: { name: string; className?: string; tagline?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[17px] font-extrabold tracking-tight text-fg">{name}</span>
        {tagline && <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{tagline}</span>}
      </span>
    </span>
  );
}
