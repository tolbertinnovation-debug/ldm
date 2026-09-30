import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireStaff("products:manage");
  const [cats, settings] = await Promise.all([db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)), getSettings()]);
  return (
    <>
      <PageHeader back={{ href: "/admin/products", label: "Products" }} title="New product" />
      <ProductForm
        currency={settings.commerce.currency}
        categories={cats.map((c) => ({ value: c.id, label: c.name }))}
        v={{ type: "PRODUCT", name: "", slug: "", sku: "", categoryId: "", shortDescription: "", description: "", unit: "EACH", price: "", compareAtPrice: "", costPrice: "", pricingNote: "", variableWeight: false, minQty: 1, qtyStep: 1, maxQty: "", trackInventory: true, lowStockThreshold: 0, allowBackorder: false, availability: "IN_STOCK", leadTimeDays: 0, allowDelivery: true, allowPickup: true, taxable: true, status: "ACTIVE", featured: false, tags: "", attributes: "", options: [], images: [] }}
      />
    </>
  );
}
