"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { cn } from "@/components/ui";

export function SearchBox({ className, autoFocusParam }: { className?: string; autoFocusParam?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusParam && params.get("focus") === "search") ref.current?.focus();
  }, [autoFocusParam, params]);
  return (
    <form
      role="search"
      action="/shop"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim() ?? "";
        router.push(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
      }}
      className={cn("relative", className)}
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        ref={ref}
        name="q"
        type="search"
        defaultValue={params.get("q") ?? ""}
        placeholder="Search pork, fish, piglets, greens…"
        aria-label="Search products"
        className="h-11 w-full rounded-full border border-border bg-surface-2 pl-10 pr-4 text-[15px] outline-none transition placeholder:text-subtle focus:border-primary focus:bg-surface focus:ring-3 focus:ring-primary/15 sm:text-sm"
      />
    </form>
  );
}
