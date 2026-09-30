import { PackageSearch } from "lucide-react";
import { TrackLookupForm } from "@/components/shop/track-forms";

export const metadata = { title: "Track your order" };

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card p-6 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg">
          <PackageSearch className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Track your order</h1>
        <p className="mt-1 text-sm text-muted">Enter the order number from your SMS or WhatsApp message.</p>
        <div className="mt-6">
          <TrackLookupForm />
        </div>
      </div>
    </div>
  );
}
