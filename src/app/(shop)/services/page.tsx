import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { listProducts } from "@/lib/services/catalog";
import { getSettings } from "@/lib/settings";
import { Price, ProductImage } from "@/components/shop/visuals";

export const metadata = { title: "Services & training" };

export default async function ServicesPage() {
  const [services, settings] = await Promise.all([listProducts({ type: "SERVICE" }), getSettings()]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent"><GraduationCap className="h-4 w-4" aria-hidden /> Services & training</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Expertise from a working farm</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted">
          From hygienic slaughter and processing to hands-on training for new farmers, youth and women&apos;s groups — book a REAP service in minutes. We&apos;ll call you to confirm the details.
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {services.map((s) => (
          <Link key={s.id} href={`/services/${s.slug}`} className="card group flex gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl sm:h-28 sm:w-28">
              <ProductImage src={s.images[0]} alt={s.name} icon={s.categoryIcon} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 className="font-semibold leading-snug">{s.name}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{s.shortDescription}</p>
              <div className="mt-auto flex items-end justify-between pt-3">
                <Price cents={s.price} currency={settings.commerce.currency} unit={s.unit} size="sm" />
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">Book <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden /></span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
