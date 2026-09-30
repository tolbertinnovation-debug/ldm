import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { PiggyBank } from "lucide-react";
import { db } from "@/lib/db";
import { livestock, livestockEvents, products } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { ANIMAL_STATUS_META, SPECIES_LABELS } from "@/lib/constants";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge, Tabs } from "@/components/ui";
import { AnimalActions, AnimalForm } from "@/components/admin/livestock-forms";
import { StatTile, sp } from "@/components/admin/bits";

export const metadata = { title: "Livestock & ponds" };

function ageLabel(birth: string | null) {
  if (!birth) return null;
  const days = Math.floor((Date.now() - new Date(birth).getTime()) / 86_400_000);
  return days < 60 ? `${days} days` : `${Math.round(days / 30.4)} months`;
}

export default async function LivestockPage(props: PageProps<"/admin/livestock">) {
  await requireStaff("livestock:manage");
  const params = await props.searchParams;
  const tab = sp(params.tab) ?? "active";
  const species = sp(params.species);
  const conds: SQL[] = [];
  if (tab === "active") conds.push(inArray(livestock.status, ["GROWING", "AVAILABLE", "RESERVED"]));
  else if (tab === "closed") conds.push(inArray(livestock.status, ["SOLD", "SLAUGHTERED", "DECEASED"]));
  if (species) conds.push(eq(livestock.species, species));
  const [animals, prods, stats] = await Promise.all([
    db.select({ a: livestock, product: products.name }).from(livestock).leftJoin(products, eq(products.id, livestock.productId)).where(conds.length ? and(...conds) : undefined).orderBy(asc(livestock.species), asc(livestock.tag)).limit(300),
    db.select({ id: products.id, name: products.name, unit: products.unit }).from(products).where(eq(products.type, "PRODUCT")).orderBy(asc(products.name)),
    db.select({ species: livestock.species, status: livestock.status, n: sql<number>`count(*)::int`, heads: sql<number>`sum(${livestock.headCount})::int` }).from(livestock).groupBy(livestock.species, livestock.status),
  ]);
  const ids = animals.map((x) => x.a.id);
  const events = ids.length ? await db.select().from(livestockEvents).where(inArray(livestockEvents.animalId, ids)).orderBy(desc(livestockEvents.createdAt)).limit(600) : [];
  const lastEvents = new Map<string, typeof events>();
  for (const e of events) {
    const list = lastEvents.get(e.animalId) ?? [];
    if (list.length < 3) list.push(e);
    lastEvents.set(e.animalId, list);
  }
  const productOpts = prods.map((p) => ({ value: p.id, label: p.name }));
  const meatOpts = prods.filter((p) => p.unit === "LB" || p.unit === "KG").map((p) => ({ value: p.id, label: `${p.name} (${p.unit.toLowerCase()})` }));
  const count = (sp: string, statuses: string[]) => stats.filter((s) => s.species === sp && statuses.includes(s.status)).reduce((a, s) => a + (sp === "FISH" ? s.heads : s.n), 0);

  return (
    <>
      <PageHeader title="Livestock & ponds" description="Pig register, fish batches, weights, health records — and turning animals into stock for sale." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Pigs on farm" value={String(count("PIG", ["GROWING", "AVAILABLE", "RESERVED"]))} />
        <StatTile label="Pigs for sale" value={String(count("PIG", ["AVAILABLE"]))} />
        <StatTile label="Fish in ponds" value={count("FISH", ["GROWING", "AVAILABLE"]).toLocaleString()} />
        <StatTile label="Losses recorded" value={String(stats.filter((s) => s.status === "DECEASED").reduce((a, s) => a + s.n, 0))} />
      </div>
      <Card className="mb-6">
        <CardHeader title="Register animal or batch" />
        <CardBody><AnimalForm products={productOpts} /></CardBody>
      </Card>
      <Tabs active={tab} tabs={[{ key: "active", label: "On farm", href: "/admin/livestock?tab=active" }, { key: "closed", label: "Sold / slaughtered / lost", href: "/admin/livestock?tab=closed" }, { key: "all", label: "All", href: "/admin/livestock?tab=all" }]} />
      {animals.length === 0 ? (
        <Card className="mt-4"><EmptyState icon={<PiggyBank className="h-6 w-6" />} title="No animals here" /></Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {animals.map(({ a, product }) => (
            <Card key={a.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{a.tag}</p>
                  <p className="text-sm text-muted">
                    {SPECIES_LABELS[a.species as keyof typeof SPECIES_LABELS] ?? a.species}{a.breed && ` · ${a.breed}`}{a.species !== "FISH" && a.sex !== "UNKNOWN" && ` · ${a.sex.toLowerCase()}`}
                  </p>
                </div>
                <StatusBadge status={a.status} meta={ANIMAL_STATUS_META} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">{a.species === "FISH" ? "Fish" : "Weight"}</dt><dd className="font-semibold">{a.species === "FISH" ? a.headCount.toLocaleString() : a.weightKg ? `${a.weightKg} kg` : "—"}</dd></div>
                <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">{a.species === "FISH" ? "Avg weight" : "Age"}</dt><dd className="font-semibold">{a.species === "FISH" ? (a.weightKg ? `${a.weightKg} kg` : "—") : ageLabel(a.birthDate) ?? "—"}</dd></div>
                <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Location</dt><dd className="truncate font-semibold">{a.location ?? "—"}</dd></div>
              </dl>
              {product && <p className="mt-2 text-xs text-muted">Sells as: {product}</p>}
              {lastEvents.get(a.id)?.length ? (
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {lastEvents.get(a.id)!.map((e) => (
                    <li key={e.id}>{formatDateTime(e.createdAt)} · {e.type.toLowerCase()}{e.weightKg ? ` ${e.weightKg} kg` : ""}{e.note ? ` — ${e.note}` : ""}</li>
                  ))}
                </ul>
              ) : a.birthDate ? <p className="mt-3 text-xs text-muted">Since {formatDate(a.birthDate)}</p> : null}
              <div className="mt-4 border-t border-border pt-3">
                <AnimalActions id={a.id} species={a.species} status={a.status} products={productOpts} meatProducts={meatOpts} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
