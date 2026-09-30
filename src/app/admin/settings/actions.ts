"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { deliveryZones, pickupLocations } from "@/lib/db/schema";
import { formObject, ok, runAction, UserError, zf, type ActionState } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { getSettings, saveSettingsSection } from "@/lib/settings";

const txt = (max = 500) => z.string().trim().max(max).default("");
const bool = () => zf.checkbox();

function done(section: string, actor: { id: string; name: string }) {
  revalidatePath("/", "layout");
  return audit({ actor, action: "settings.update", entityType: "settings", entityId: section, summary: `Updated ${section} settings` }).then(() => ok("Settings saved"));
}

export async function saveBusinessAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("settings:manage");
    const f = formObject(formData);
    const d = z.object({ name: zf.requiredText("Business name", 80), legalName: txt(160), tagline: txt(160), about: txt(1200), phone: txt(40), whatsapp: txt(40), email: txt(120), address: txt(200), city: txt(80), country: txt(80), hours: txt(120), website: txt(200) }).parse(f);
    const social = z.object({ facebook: txt(200), instagram: txt(200), tiktok: txt(200), x: txt(200), youtube: txt(200) }).parse({ facebook: f["social.facebook"], instagram: f["social.instagram"], tiktok: f["social.tiktok"], x: f["social.x"], youtube: f["social.youtube"] });
    for (const url of [...Object.values(social), d.website]) if (url && !/^https?:\/\//.test(url)) throw new UserError(`Links must start with https:// (${url})`);
    await saveSettingsSection("business", { ...d, social });
    return done("business", actor);
  });
}

export async function saveCommerceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("settings:manage");
    const d = z
      .object({ currency: z.string().regex(/^[A-Z]{3}$/), secondaryCurrency: z.string().regex(/^([A-Z]{3})?$/), exchangeRate: zf.decimal("Exchange rate", 0, 100000), showSecondaryPrices: bool(), taxRate: zf.decimal("Tax rate", 0, 50), taxLabel: txt(20), orderPrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "Use 1–8 capital letters or digits"), minOrderAmount: z.string().default(""), deliveryEnabled: bool(), pickupEnabled: bool(), allowGuestCheckout: bool(), timeSlots: txt(600), announcement: txt(200) })
      .parse(formObject(formData));
    const current = await getSettings();
    await saveSettingsSection("commerce", {
      ...current.commerce,
      ...d,
      minOrderAmount: parseMoney(d.minOrderAmount) ?? 0,
      timeSlots: d.timeSlots.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10),
    });
    return done("commerce", actor);
  });
}

export async function savePaymentsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("settings:manage");
    const f = formObject(formData);
    const flag = (k: string) => f[k] === "on";
    await saveSettingsSection("payments", {
      cashOnDelivery: flag("cashOnDelivery"),
      payAtPickup: flag("payAtPickup"),
      orangeMoney: { enabled: flag("om.enabled"), number: (f["om.number"] ?? "").slice(0, 40), accountName: (f["om.accountName"] ?? "").slice(0, 80), instructions: (f["om.instructions"] ?? "").slice(0, 400) },
      mtnMomo: { enabled: flag("momo.enabled"), number: (f["momo.number"] ?? "").slice(0, 40), accountName: (f["momo.accountName"] ?? "").slice(0, 80), instructions: (f["momo.instructions"] ?? "").slice(0, 400) },
      bankTransfer: { enabled: flag("bank.enabled"), details: (f["bank.details"] ?? "").slice(0, 600) },
      card: { enabled: flag("card.enabled") },
    });
    return done("payments", actor);
  });
}

export async function saveNotificationsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("settings:manage");
    const d = z.object({ adminPhone: txt(40), adminEmail: txt(120), notifyNewOrder: bool(), notifyNewBooking: bool(), notifyLowStock: bool(), customerOrderUpdates: bool(), defaultChannel: z.enum(["WHATSAPP", "SMS", "EMAIL"]), dueDays: zf.int("Due days", 0, 365), terms: txt(1000), notes: txt(500) }).parse(formObject(formData));
    await saveSettingsSection("notifications", { adminPhone: d.adminPhone, adminEmail: d.adminEmail, notifyNewOrder: d.notifyNewOrder, notifyNewBooking: d.notifyNewBooking, notifyLowStock: d.notifyLowStock, customerOrderUpdates: d.customerOrderUpdates, defaultChannel: d.defaultChannel });
    await saveSettingsSection("invoice", { dueDays: d.dueDays, terms: d.terms, notes: d.notes });
    return done("notifications", actor);
  });
}

export async function saveZoneAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("settings:manage");
    const d = z.object({ id: zf.optionalUuid(), name: zf.requiredText("Name", 80), description: zf.optionalText(300), fee: z.string(), freeOver: zf.optionalText(20), estimatedTime: zf.optionalText(60), sortOrder: zf.int("Order", 0, 1000), active: zf.checkbox() }).parse(formObject(formData));
    const values = { name: d.name, description: d.description, fee: parseMoney(d.fee) ?? 0, freeOver: d.freeOver ? parseMoney(d.freeOver) : null, estimatedTime: d.estimatedTime, sortOrder: d.sortOrder, active: d.active };
    if (d.id) await db.update(deliveryZones).set(values).where(eq(deliveryZones.id, d.id));
    else await db.insert(deliveryZones).values(values);
    await audit({ actor, action: "zone.save", entityType: "delivery_zone", entityId: d.id, summary: `Delivery zone ${d.name}: fee ${d.fee}` });
    revalidatePath("/admin/settings");
    return ok("Delivery area saved");
  });
}

export async function savePickupAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await assertPermission("settings:manage");
    const d = z.object({ id: zf.optionalUuid(), name: zf.requiredText("Name", 100), address: zf.requiredText("Address", 300), hours: zf.optionalText(120), phone: zf.optionalText(40), instructions: zf.optionalText(400), lat: zf.optionalDecimal(-90, 90), lng: zf.optionalDecimal(-180, 180), active: zf.checkbox() }).parse(formObject(formData));
    const { id, ...values } = d;
    if (id) await db.update(pickupLocations).set(values).where(eq(pickupLocations.id, id));
    else await db.insert(pickupLocations).values(values);
    await audit({ actor, action: "pickup.save", entityType: "pickup_location", entityId: id, summary: `Pickup location ${d.name}` });
    revalidatePath("/admin/settings");
    return ok("Pickup location saved");
  });
}
