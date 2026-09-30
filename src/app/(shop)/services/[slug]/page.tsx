import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/services/catalog";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { BookingForm } from "@/components/shop/booking-form";
import { Price, ProductImage } from "@/components/shop/visuals";

export async function generateMetadata(props: PageProps<"/services/[slug]">) {
  const { slug } = await props.params;
  const row = await getProductBySlug(slug);
  return row ? { title: row.product.name, description: row.product.shortDescription ?? undefined } : {};
}

export default async function ServicePage(props: PageProps<"/services/[slug]">) {
  const { slug } = await props.params;
  const row = await getProductBySlug(slug);
  if (!row || row.product.type !== "SERVICE") notFound();
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);
  const s = row.product;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/services" className="text-sm font-medium text-muted hover:text-fg">← All services</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_440px]">
        <div>
          <div className="aspect-[16/9] overflow-hidden rounded-3xl border border-border">
            <ProductImage src={s.images[0]} alt={s.name} icon={row.category?.icon} size="lg" />
          </div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">{s.name}</h1>
          <Price cents={s.price} currency={settings.commerce.currency} unit={s.unit} size="lg" className="mt-3" />
          <p className="mt-5 whitespace-pre-line text-[17px] leading-relaxed text-muted">{s.description ?? s.shortDescription}</p>
        </div>
        <div className="card h-fit p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 className="mb-4 text-lg font-semibold">Book this service</h2>
          <BookingForm serviceId={s.id} perPerson={s.unit === "PERSON"} defaults={{ name: user?.name ?? "", phone: user?.phone ?? "", email: user?.email ?? "" }} minDate={new Date().toISOString().slice(0, 10)} />
        </div>
      </div>
    </div>
  );
}
