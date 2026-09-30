import Link from "next/link";
import { ArrowRight, BadgePercent, CheckCircle2, GraduationCap, HandCoins, ShieldCheck, Smartphone, Sprout, Truck, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { ProductCard } from "@/components/shop/product-card";
import { ProductImage, SocialIcon, categoryVisual } from "@/components/shop/visuals";
import { categoriesWithCounts, listProducts } from "@/lib/services/catalog";
import { getSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/phone";

export default async function HomePage() {
  const [settings, cats, featured, services] = await Promise.all([
    getSettings(),
    categoriesWithCounts(),
    listProducts({ featured: true, type: "PRODUCT", limit: 8 }),
    listProducts({ type: "SERVICE", limit: 3, featured: true }),
  ]);
  const { business: b, commerce: c } = settings;
  const secondary = c.showSecondaryPrices && c.secondaryCurrency ? { currency: c.secondaryCurrency, rate: c.exchangeRate } : null;
  const productCats = cats.filter((x) => x.slug !== "services");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-900 text-white">
        <div className="absolute inset-0 opacity-[0.12]" aria-hidden>
          <svg className="h-full w-full">
            <defs>
              <pattern id="rows" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
                <path d="M0 18h36" stroke="#aed8b9" strokeWidth="1.2" strokeDasharray="6 5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#rows)" />
          </svg>
        </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div className="animate-slide-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-100 ring-1 ring-white/15">
              <Sprout className="h-3.5 w-3.5" aria-hidden /> {b.address.replace(/^REAP Farm, /, "")} · {b.country}
            </p>
            <h1 className="mt-5 text-[34px] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[56px]">
              Fresh pork, live fish &amp; <span className="text-harvest-300">clean greens</span> — straight from our farm.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-brand-100">
              Order live or dressed pigs, meat by the pound, tilapia, catfish and aquaponic vegetables. Delivered across Monrovia or ready for pickup — pay with cash, Orange Money or MTN MoMo.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/shop" size="lg" variant="accent">
                Shop the farm <ArrowRight className="h-5 w-5" aria-hidden />
              </ButtonLink>
              {b.whatsapp && (
                <a href={whatsappLink(b.whatsapp, `Hello ${b.name}, I would like to place an order.`)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 px-6 text-[15px] font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/15">
                  <SocialIcon name="whatsapp" /> Order on WhatsApp
                </a>
              )}
            </div>
            <ul className="mt-8 grid gap-3 text-sm text-brand-100 sm:grid-cols-3">
              {[
                { icon: Truck, text: "Same-day delivery in Monrovia" },
                { icon: Smartphone, text: "Orange Money, MoMo & cash" },
                { icon: ShieldCheck, text: "Hygienic, vet-checked" },
              ].map((x) => (
                <li key={x.text} className="flex items-center gap-2">
                  <x.icon className="h-4 w-4 shrink-0 text-harvest-300" aria-hidden /> {x.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {productCats.slice(0, 4).map((cat, i) => (
              <Link
                key={cat.slug}
                href={`/shop/category/${cat.slug}`}
                className={`group relative overflow-hidden rounded-3xl ring-1 ring-white/10 transition hover:-translate-y-1 ${i % 2 === 1 ? "translate-y-6" : ""}`}
              >
                <div className="aspect-[4/5]">
                  <ProductImage alt={cat.name} icon={cat.icon} size="lg" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  <p className="font-bold">{cat.name}</p>
                  <p className="text-xs text-white/80">{cat.count} items</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Shop by category</h2>
            <p className="mt-1 text-muted">Everything we raise and grow, in one place.</p>
          </div>
          <Link href="/shop" className="link hidden text-sm sm:inline">View all products →</Link>
        </div>
        <div className="scrollbar-none -mx-4 mt-6 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-7">
          {cats.map((cat) => {
            const v = categoryVisual(cat.icon);
            const Icon = v.icon;
            return (
              <Link key={cat.slug} href={cat.slug === "services" ? "/services" : `/shop/category/${cat.slug}`} className="card flex w-36 shrink-0 flex-col items-center gap-3 p-4 text-center transition hover:-translate-y-0.5 hover:shadow-lift sm:w-auto">
                <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${v.from}, ${v.to})`, color: v.fg }}>
                  <Icon className="h-7 w-7" strokeWidth={1.6} aria-hidden />
                </span>
                <span className="text-sm font-semibold leading-tight">{cat.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Fresh this week</h2>
            <p className="mt-1 text-muted">Our most popular farm products.</p>
          </div>
          <Link href="/shop" className="link text-sm">See all →</Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} p={p} currency={c.currency} secondary={secondary} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="card overflow-hidden">
          <div className="grid md:grid-cols-4">
            <div className="bg-primary-soft p-6 sm:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-primary-soft-fg">How ordering works</h2>
              <p className="mt-2 text-sm text-primary-soft-fg/80">Simple, fast and made for your phone.</p>
            </div>
            {[
              { n: "1", title: "Choose", text: "Pick live pigs, cuts by the pound, fish or produce. Add options like cleaning or cutting." },
              { n: "2", title: "Deliver or pick up", text: "Choose your area and time slot, or collect at the farm in Bentol City." },
              { n: "3", title: "Pay your way", text: "Cash on delivery, Orange Money, MTN MoMo or card — and track your order live." },
            ].map((s) => (
              <div key={s.n} className="border-t border-border p-6 sm:p-8 md:border-l md:border-t-0">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-bold text-white">{s.n}</span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services & training */}
      {services.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[1fr_2fr] md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-accent">Services & training</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Grow with REAP</h2>
              <p className="mt-3 leading-relaxed text-muted">
                Book hygienic slaughter and processing, hands-on pig and aquaponics training, or a farm visit from our technicians. We train youth, women and rural entrepreneurs to build profitable farms.
              </p>
              <ButtonLink href="/services" variant="outline" className="mt-5">
                <GraduationCap className="h-4 w-4" aria-hidden /> All services
              </ButtonLink>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {services.map((s) => (
                <ProductCard key={s.id} p={s} currency={c.currency} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Impact */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-harvest-500 to-harvest-600 px-6 py-10 text-white sm:px-10">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Every order supports rural Liberia</h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-white/90">{b.about}</p>
            </div>
            <ul className="grid grid-cols-2 gap-3 text-sm">
              {[
                { icon: Users, text: "Youth & women trained" },
                { icon: HandCoins, text: "Fair prices for farmers" },
                { icon: Sprout, text: "Sustainable aquaponics" },
                { icon: BadgePercent, text: "Wholesale for businesses" },
              ].map((x) => (
                <li key={x.text} className="flex items-center gap-2 rounded-2xl bg-white/15 p-3 font-medium ring-1 ring-white/20">
                  <x.icon className="h-5 w-5 shrink-0" aria-hidden /> {x.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Business accounts */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="card grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Restaurants, hotels & market sellers</h2>
            <ul className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
              {["Standing wholesale discounts", "Invoices with 14-day terms", "Scheduled weekly deliveries", "Dedicated WhatsApp line"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          {b.whatsapp && (
            <a href={whatsappLink(b.whatsapp, "Hello REAP, I would like to open a business account.")} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 font-semibold text-white shadow-sm hover:brightness-95">
              <SocialIcon name="whatsapp" /> Open a business account
            </a>
          )}
        </div>
      </section>
    </>
  );
}
