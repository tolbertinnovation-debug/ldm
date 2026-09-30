"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { livestock, livestockEvents, products } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { adjustStock } from "@/lib/services/inventory";

function done(msg: string) {
  revalidatePath("/admin/livestock");
  revalidatePath("/admin/inventory");
  return ok(msg);
}

export async function saveAnimalAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("livestock:manage");
    const d = z
      .object({
        id: zf.optionalUuid(),
        tag: zf.requiredText("Tag", 40),
        species: z.enum(["PIG", "FISH", "POULTRY", "GOAT", "OTHER"]),
        breed: zf.optionalText(80),
        sex: z.enum(["MALE", "FEMALE", "MIXED", "UNKNOWN"]),
        headCount: zf.int("Head count", 1, 1_000_000),
        birthDate: zf.optionalDate(),
        source: zf.optionalText(40),
        weightKg: zf.optionalDecimal(0, 5000),
        location: zf.optionalText(80),
        productId: zf.optionalUuid(),
        notes: zf.optionalText(1000),
      })
      .parse(formObject(formData));
    const { id, ...values } = d;
    if (id) await db.update(livestock).set(values).where(eq(livestock.id, id));
    else {
      const [clash] = await db.select({ id: livestock.id }).from(livestock).where(eq(livestock.tag, d.tag));
      if (clash) throw new UserError("That tag is already used.", { tag: "Already used" });
      const [a] = await db.insert(livestock).values(values).returning();
      if (d.weightKg) await db.insert(livestockEvents).values({ animalId: a!.id, type: "WEIGHED", weightKg: d.weightKg, note: "Registered", createdById: actor.id });
    }
    await audit({ actor, action: "livestock.save", entityType: "livestock", entityId: id, summary: `Saved ${d.tag}` });
    return done(`${d.tag} saved`);
  });
}

export async function livestockEventAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("livestock:manage");
    const d = z
      .object({
        animalId: z.uuid(),
        action: z.enum(["WEIGHED", "VACCINATED", "TREATED", "MOVED", "NOTE", "LIST", "UNLIST", "SOLD", "DECEASED", "SLAUGHTER", "HARVEST"]),
        weightKg: zf.optionalDecimal(0, 5000),
        quantity: zf.optionalDecimal(0, 1_000_000),
        count: zf.optionalInt(0, 1_000_000),
        productId: zf.optionalUuid(),
        location: zf.optionalText(80),
        note: zf.optionalText(500),
      })
      .parse(formObject(formData));
    const msg = await db.transaction(async (tx) => {
      const [a] = await tx.select().from(livestock).where(eq(livestock.id, d.animalId)).for("update");
      if (!a) throw new UserError("Animal not found.");
      const log = (type: string, note?: string | null, weightKg?: number | null) => tx.insert(livestockEvents).values({ animalId: a.id, type, note: note ?? d.note, weightKg: weightKg ?? null, createdById: actor.id });
      const linkedTracked = async () => {
        if (!a.productId) return false;
        const [p] = await tx.select({ t: products.trackInventory, unit: products.unit }).from(products).where(eq(products.id, a.productId));
        return !!p?.t && (p.unit === "HEAD" || p.unit === "EACH");
      };
      switch (d.action) {
        case "WEIGHED":
          if (!d.weightKg) throw new UserError("Enter the weight.", { weightKg: "Required" });
          await tx.update(livestock).set({ weightKg: d.weightKg }).where(eq(livestock.id, a.id));
          await log("WEIGHED", d.note, d.weightKg);
          return `${a.tag} weighed at ${d.weightKg} kg`;
        case "MOVED":
          await tx.update(livestock).set({ location: d.location }).where(eq(livestock.id, a.id));
          await log("MOVED", `Moved to ${d.location}${d.note ? ` — ${d.note}` : ""}`);
          return `${a.tag} moved`;
        case "VACCINATED":
        case "TREATED":
        case "NOTE":
          await log(d.action);
          return "Recorded";
        case "LIST": {
          if (a.status === "AVAILABLE") return `${a.tag} is already for sale`;
          await tx.update(livestock).set({ status: "AVAILABLE" }).where(eq(livestock.id, a.id));
          if (a.species !== "FISH" && (await linkedTracked())) await adjustStock(tx, { productId: a.productId!, delta: 1, type: "PRODUCTION", reference: a.tag, animalId: a.id, actorId: actor.id, note: "Listed for sale" });
          await log("STATUS", "Listed for sale");
          return `${a.tag} listed for sale`;
        }
        case "UNLIST": {
          await tx.update(livestock).set({ status: "GROWING" }).where(eq(livestock.id, a.id));
          if (a.status === "AVAILABLE" && a.species !== "FISH" && (await linkedTracked())) await adjustStock(tx, { productId: a.productId!, delta: -1, type: "ADJUSTMENT", reference: a.tag, animalId: a.id, actorId: actor.id, note: "Removed from sale" });
          await log("STATUS", "Removed from sale");
          return `${a.tag} removed from sale`;
        }
        case "SOLD":
          // Stock for sold animals is already deducted by the order.
          await tx.update(livestock).set({ status: "SOLD" }).where(eq(livestock.id, a.id));
          await log("STATUS", `Sold${d.note ? ` — ${d.note}` : ""}`);
          return `${a.tag} marked sold`;
        case "DECEASED":
          await tx.update(livestock).set({ status: "DECEASED" }).where(eq(livestock.id, a.id));
          if (a.status === "AVAILABLE" && a.species !== "FISH" && (await linkedTracked())) await adjustStock(tx, { productId: a.productId!, delta: -1, type: "MORTALITY", reference: a.tag, animalId: a.id, actorId: actor.id, note: d.note });
          await log("STATUS", `Died${d.note ? ` — ${d.note}` : ""}`);
          return `${a.tag} recorded as deceased`;
        case "SLAUGHTER": {
          if (!d.productId || !d.quantity) throw new UserError("Choose the meat product and carcass weight.", { quantity: "Required" });
          await tx.update(livestock).set({ status: "SLAUGHTERED" }).where(eq(livestock.id, a.id));
          if (a.status === "AVAILABLE" && (await linkedTracked())) await adjustStock(tx, { productId: a.productId!, delta: -1, type: "ADJUSTMENT", reference: a.tag, animalId: a.id, actorId: actor.id, note: "Slaughtered" });
          await adjustStock(tx, { productId: d.productId, delta: d.quantity, type: "PRODUCTION", reference: `Slaughter ${a.tag}`, animalId: a.id, actorId: actor.id, note: d.note });
          await log("SLAUGHTERED", `Carcass yield ${d.quantity}${d.note ? ` — ${d.note}` : ""}`);
          return `${a.tag} slaughtered; ${d.quantity} added to stock`;
        }
        case "HARVEST": {
          if (!d.quantity) throw new UserError("Enter the harvested quantity.", { quantity: "Required" });
          const productId = d.productId ?? a.productId;
          if (!productId) throw new UserError("Choose which product the harvest goes into.");
          const remaining = Math.max(0, a.headCount - (d.count ?? 0));
          await tx.update(livestock).set({ headCount: remaining, status: remaining === 0 ? "SOLD" : a.status }).where(eq(livestock.id, a.id));
          await adjustStock(tx, { productId, delta: d.quantity, type: "PRODUCTION", reference: `Harvest ${a.tag}`, animalId: a.id, actorId: actor.id, note: d.note });
          await log("HARVEST", `Harvested ${d.quantity}${d.count ? ` (${d.count} fish)` : ""}${d.note ? ` — ${d.note}` : ""}`);
          return `Harvest recorded: +${d.quantity} to stock`;
        }
      }
    });
    await audit({ actor, action: `livestock.${d.action.toLowerCase()}`, entityType: "livestock", entityId: d.animalId, summary: msg });
    return done(msg);
  });
}
