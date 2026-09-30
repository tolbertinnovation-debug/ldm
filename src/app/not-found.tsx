import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <LogoMark className="mx-auto h-14 w-14" />
        <p className="mt-6 text-sm font-semibold text-accent">404</p>
        <h1 className="mt-1 text-2xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-muted">It may have moved, or the link is incomplete.</p>
        <div className="mt-6 flex justify-center gap-4 text-sm font-semibold">
          <Link href="/" className="text-primary">Go home</Link>
          <Link href="/shop" className="text-primary">Browse the shop</Link>
        </div>
      </div>
    </main>
  );
}
