import { GraduationCap, HandCoins, Leaf, Users } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { ButtonLink } from "@/components/ui";

export const metadata = { title: "About REAP" };

export default async function AboutPage() {
  const { business: b } = await getSettings();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">About us</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{b.legalName}</h1>
      <p className="mt-5 text-lg leading-relaxed text-muted">{b.about}</p>
      <p className="mt-4 leading-relaxed text-muted">
        REAP empowers and equips children, at-risk youth, rural farmers, women, girls and entrepreneurs through skills-based training, capacity building and resources — strengthening the local employment pipeline and the agricultural value chain. Our farm in Bentol City raises pigs and fish and grows aquaponic vegetables, serving as a hands-on classroom and a source of fresh, affordable food.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {[
          { icon: GraduationCap, title: "Skills-based training", text: "Pig farming, aquaponics, business & financial literacy, leadership and ethics." },
          { icon: Users, title: "Youth, women & girls", text: "Creating pathways to jobs and enterprise for those most often left out." },
          { icon: Leaf, title: "Sustainable farming", text: "Aquaponics saves water and turns fish waste into fertiliser for vegetables." },
          { icon: HandCoins, title: "Profitable farmers", text: "Market linkages, fair prices and inputs that raise rural incomes." },
        ].map((x) => (
          <div key={x.title} className="card p-5">
            <x.icon className="h-6 w-6 text-primary" aria-hidden />
            <h2 className="mt-3 font-semibold">{x.title}</h2>
            <p className="mt-1 text-sm text-muted">{x.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/shop">Shop the farm</ButtonLink>
        <ButtonLink href="/services" variant="outline">Training & services</ButtonLink>
        {b.website && <a href={b.website} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center px-4 text-sm font-semibold text-primary">Visit {b.website.replace(/^https?:\/\/(www\.)?/, "")} →</a>}
      </div>
    </div>
  );
}
