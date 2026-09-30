import Link from "next/link";
import { LogoMark } from "@/components/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm">
        <LogoMark className="mx-auto h-14 w-14" />
        <h1 className="mt-5 text-2xl font-bold">You&apos;re offline</h1>
        <p className="mt-2 text-muted">Check your mobile data or Wi-Fi. Your cart is saved and will be here when you reconnect.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-primary">
          Try again
        </Link>
      </div>
    </main>
  );
}
