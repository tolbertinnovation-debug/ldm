"use client";

import { useEffect, useState } from "react";
import { cn } from "./ui";

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();
let counter = 0;

function emit(kind: Toast["kind"], text: string) {
  const t = { id: ++counter, kind, text };
  listeners.forEach((l) => l(t));
}

export const toast = {
  success: (text: string) => emit("success", text),
  error: (text: string) => emit("error", text),
  info: (text: string) => emit("info", text),
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const l: Listener = (t) => {
      setItems((prev) => [...prev.slice(-3), t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.kind === "error" ? 6000 : 3500);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lift ring-1",
            t.kind === "success" && "bg-brand-800 text-white ring-brand-900",
            t.kind === "error" && "bg-danger text-white ring-danger",
            t.kind === "info" && "bg-surface text-fg ring-border",
          )}
        >
          <span aria-hidden>{t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}</span>
          <span className="flex-1">{t.text}</span>
          <button className="opacity-70 hover:opacity-100" onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
