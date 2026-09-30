import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/components/ui";

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "mtd", label: "This month" },
  { key: "lm", label: "Last month" },
  { key: "ytd", label: "Year" },
];

export function RangeTabs({ active, base, extra = {} }: { active: string; base: string; extra?: Record<string, string | undefined> }) {
  return (
    <div className="scrollbar-none inline-flex max-w-full overflow-x-auto rounded-xl bg-surface-2 p-1 text-[13px] font-medium">
      {PRESETS.map((p) => {
        const params = new URLSearchParams(Object.entries({ ...extra, range: p.key }).filter(([, v]) => v) as [string, string][]);
        return (
          <Link key={p.key} href={`${base}?${params}`} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 transition", active === p.key ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

export function StatTile({ label, value, delta, hint, href, invert }: { label: string; value: string; delta?: number | null; hint?: string; href?: string; invert?: boolean }) {
  const good = delta === null || delta === undefined ? null : invert ? delta < 0 : delta >= 0;
  const body = (
    <>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="tabular mt-1.5 text-2xl font-bold tracking-tight text-fg">{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {delta !== undefined && delta !== null && (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", good ? "text-success-fg" : "text-danger-fg")}>
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
            {Math.abs(delta * 100).toFixed(0)}%
          </span>
        )}
        {hint && <span className="text-subtle">{hint}</span>}
      </div>
    </>
  );
  const cls = "card block p-4 sm:p-5";
  return href ? <Link href={href} className={cn(cls, "transition hover:shadow-lift")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function sp(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export function pageNum(v: string | string[] | undefined) {
  const n = Number(sp(v) ?? 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function SearchForm({ action, placeholder, defaultValue, children }: { action: string; placeholder: string; defaultValue?: string; children?: React.ReactNode }) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="q" type="search" defaultValue={defaultValue} placeholder={placeholder} className="field h-10 max-w-xs flex-1 sm:w-64" />
      {children}
      <button className="h-10 rounded-xl bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3">Filter</button>
    </form>
  );
}
