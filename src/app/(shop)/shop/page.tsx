import type { Metadata } from "next";
import { Catalog } from "@/components/shop/catalog";
import type { CatalogSort } from "@/lib/services/catalog";

export const metadata: Metadata = { title: "Shop" };

export default async function ShopPage(props: PageProps<"/shop">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const sort = typeof sp.sort === "string" ? (sp.sort as CatalogSort) : undefined;
  return <Catalog q={q} sort={sort} />;
}
