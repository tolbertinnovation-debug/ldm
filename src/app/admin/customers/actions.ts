"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { CUSTOMER_TYPES } from "@/lib/constants";

const schema = z.object({
  id: zf.optionalUuid(),
  name: zf.requiredText("Name", 120),
  phone: zf.optionalText(30),
  email: zf.email(),
  type: z.enum(CUSTOMER_TYPES),
  companyName: zf.optionalText(120),
  tags: zf.optionalText(300),
  notes: zf.optionalText(4000),
  source: zf.optionalText(80),
  preferredChannel: z.enum(["WHATSAPP", "SMS", "EMAIL"]),
  discountPercent: zf.int("Discount", 0, 50),
  marketingWhatsapp: zf.checkbox(),
  marketingSms: zf.checkbox(),
  marketingEmail: zf.checkbox(),
});

export async function saveCustomerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const res = await runAction(async () => {
    const actor = await assertPermission("customers:manage");
    const d = schema.parse(formObject(formData));
    const phone = d.phone ? normalizePhone(d.phone) : null;
    if (d.phone && !phone) throw new UserError("Enter a valid phone number.", { phone: "Invalid" });
    if (!phone && !d.email) throw new UserError("Enter a phone number or email.", { phone: "Phone or email required" });
    if (phone) {
      const [clash] = await db.select({ id: customers.id, name: customers.name }).from(customers).where(d.id ? and(eq(customers.phone, phone), ne(customers.id, d.id)) : eq(customers.phone, phone));
      if (clash) throw new UserError(`This phone belongs to ${clash.name}.`, { phone: "Already used" });
    }
    const values = {
      name: d.name,
      phone,
      email: d.email,
      type: d.type,
      companyName: d.companyName,
      tags: (d.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
      notes: d.notes,
      source: d.source,
      preferredChannel: d.preferredChannel,
      discountPercent: d.discountPercent,
      marketingWhatsapp: d.marketingWhatsapp,
      marketingSms: d.marketingSms,
      marketingEmail: d.marketingEmail,
    };
    if (d.id) {
      await db.update(customers).set(values).where(eq(customers.id, d.id));
      await audit({ actor, action: "customer.update", entityType: "customer", entityId: d.id, summary: `Updated ${d.name}` });
      revalidatePath(`/admin/customers/${d.id}`);
    } else {
      const [c] = await db.insert(customers).values(values).returning({ id: customers.id });
      newId = c!.id;
      await audit({ actor, action: "customer.create", entityType: "customer", entityId: newId, summary: `Created ${d.name}` });
    }
    revalidatePath("/admin/customers");
    return ok("Customer saved");
  });
  if (newId) redirect(`/admin/customers/${newId}`);
  return res;
}
