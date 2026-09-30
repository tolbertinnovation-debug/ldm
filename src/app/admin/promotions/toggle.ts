"use server";

import { revalidatePath } from "next/cache";
import { eq, not } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { promotions } from "@/lib/db/schema";
import { ok, runAction, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export async function togglePromotionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("marketing:manage");
    const id = z.uuid().parse(formData.get("id"));
    const [p] = await db.update(promotions).set({ active: not(promotions.active) }).where(eq(promotions.id, id)).returning();
    if (p) await audit({ actor, action: "promotion.toggle", entityType: "promotion", entityId: id, summary: `${p.code} ${p.active ? "activated" : "paused"}` });
    revalidatePath("/admin/promotions");
    return ok(p?.active ? "Promotion activated" : "Promotion paused");
  });
}
