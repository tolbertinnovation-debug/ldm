import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { Catalog } from "@/components/shop/catalog";
import type { CatalogSort } from "@/lib/services/catalog";

export async function generateMetadata(props: PageProps<"/shop/category/[slug]">) {
  const { slug } = await props.params;
  const [cat] = await db.select({ name: categories.name, description: categories.description }).from(categories).where(eq(categories.slug, slug));
  return cat ? { title: cat.name, description: cat.description ?? undefined } : {};
}

export default async function CategoryPage(props: PageProps<"/shop/category/[slug]">) {
  const { slug } = await props.params;
  if (slug === "services") redirect("/services");
  const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  if (!cat) notFound();
  const sp = await props.searchParams;
  return <Catalog categorySlug={slug} q={typeof sp.q === "string" ? sp.q : undefined} sort={typeof sp.sort === "string" ? (sp.sort as CatalogSort) : undefined} />;
}
