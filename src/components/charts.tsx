"use client";

/**
 * Lightweight SVG charts (no chart library): one y-axis, thin marks, recessive
 * grid, crosshair tooltip on hover/touch, legend for ≥2 series, and colors from
 * the validated --chart-N tokens (assigned in fixed order, never cycled).
 */
import { useMemo, useRef, useState } from "react";
import { cn } from "./ui";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { formatDate, formatNumber } from "@/lib/format";

export type Series = { key: string; label: string; values: number[]; kind?: "area" | "line" };
type Fmt = "money" | "number";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

function fmtValue(v: number, fmt: Fmt, currency: string, compact = false) {
  if (fmt === "money") return compact ? formatMoneyCompact(v, currency) : formatMoney(v, currency);
  return formatNumber(v);
}

export function TimeSeriesChart({
  labels,
  series,
  format = "money",
  currency = "USD",
  height = 240,
  bucket = "day",
}: {
  labels: string[];
  series: Series[];
  format?: Fmt;
  currency?: string;
  height?: number;
  bucket?: "day" | "month";
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const pad = { l: 52, r: 12, t: 12, b: 26 };
  const n = labels.length;
  const max = useMemo(() => niceMax(Math.max(1, ...series.flatMap((s) => s.values))), [series]);
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const dateLabel = (d: string) => (bucket === "month" ? formatDate(d, { month: "short", year: "2-digit" }) : formatDate(d, { day: "numeric", month: "short" }));

  function onMove(clientX: number) {
    const svg = ref.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div className="relative">
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ background: COLORS[i] }} aria-hidden /> {s.label}
            </li>
          ))}
        </ul>
      )}
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`${series.map((s) => s.label).join(" and ")} over time`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0]!.clientX)}
        onTouchMove={(e) => onMove(e.touches[0]!.clientX)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--subtle)] text-[11px]">
              {fmtValue(t, format, currency, true)}
            </text>
          </g>
        ))}
        {labels.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={d} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-[var(--subtle)] text-[11px]">
              {dateLabel(d)}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
          const line = `M${pts.join("L")}`;
          const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`;
          return (
            <g key={s.key}>
              {(s.kind ?? (si === 0 ? "area" : "line")) === "area" && <path d={area} fill={COLORS[si]} opacity={0.12} />}
              <path d={line} fill="none" stroke={COLORS[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--border-strong)" strokeWidth={1} />
            {series.map((s, si) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={COLORS[si]} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-6 z-10 min-w-36 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lift"
          style={{ left: `${Math.min(80, Math.max(0, (x(hover) / W) * 100 - 10))}%` }}
        >
          <p className="font-semibold text-fg">{dateLabel(labels[hover]!)}</p>
          {series.map((s, si) => (
            <p key={s.key} className="mt-1 flex items-center justify-between gap-4 text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: COLORS[si] }} aria-hidden /> {s.label}
              </span>
              <span className="tabular font-semibold text-fg">{fmtValue(s.values[hover] ?? 0, format, currency)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars with labels and values — for breakdowns (no legend needed). */
export function BarList({
  items,
  format = "money",
  currency = "USD",
  colorIndex = 0,
  emptyText = "No data for this period",
}: {
  items: { label: string; value: number; hint?: string; href?: string }[];
  format?: Fmt;
  currency?: string;
  colorIndex?: number;
  emptyText?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label} className="group" title={`${it.label}: ${fmtValue(it.value, format, currency)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-fg">{it.label}</span>
            <span className="tabular shrink-0 text-muted">
              <span className="font-semibold text-fg">{fmtValue(it.value, format, currency)}</span>
              {total > 0 && <span className="ml-1.5 text-xs">{Math.round((it.value / total) * 100)}%</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full transition-all group-hover:brightness-110" style={{ width: `${Math.max(1.5, (it.value / max) * 100)}%`, background: COLORS[colorIndex] }} />
          </div>
          {it.hint && <p className="mt-0.5 text-xs text-subtle">{it.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Single-series vertical columns with per-bar hover tooltip. */
export function ColumnChart({ items, format = "money", currency = "USD", height = 200 }: { items: { label: string; value: number }[]; format?: Fmt; currency?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...items.map((i) => Math.abs(i.value))));
  return (
    <div className="relative">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {items.map((it, i) => (
          <button
            key={it.label}
            type="button"
            className="group relative flex h-full flex-1 flex-col justify-end outline-none"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${it.label}: ${fmtValue(it.value, format, currency)}`}
          >
            <span className={cn("block w-full rounded-t-[4px] transition", it.value < 0 ? "bg-danger" : "")} style={{ height: `${(Math.abs(it.value) / max) * 100}%`, background: it.value >= 0 ? COLORS[0] : undefined, opacity: hover === null || hover === i ? 1 : 0.55 }} />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {items.map((it, i) => (
          <span key={it.label} className="flex-1 truncate text-center text-[10px] text-subtle">
            {items.length <= 14 || i % Math.ceil(items.length / 10) === 0 ? it.label : ""}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div className="pointer-events-none absolute -top-2 z-10 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lift" style={{ left: `${Math.min(75, (hover / items.length) * 100)}%` }}>
          <span className="text-muted">{items[hover]!.label}</span> <span className="tabular font-semibold">{fmtValue(items[hover]!.value, format, currency)}</span>
        </div>
      )}
    </div>
  );
}
