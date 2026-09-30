import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { getSettings } from "@/lib/settings";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { business } = await getSettings();
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Link href="/" className="w-fit">
          <Logo name={business.name} tagline="Farm to table" />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </div>
      <div className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-700/60 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-harvest-500/30 blur-3xl" aria-hidden />
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight">{business.tagline}</h2>
          <ul className="mt-6 space-y-3 text-brand-100">
            {["Order in seconds from your phone", "Track deliveries live", "Reorder favourites & see your history", "Pay with cash, Orange Money or MoMo"].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-harvest-300" aria-hidden /> {t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
