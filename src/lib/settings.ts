import "server-only";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings as settingsTable } from "@/lib/db/schema";
import { TIME_SLOTS_DEFAULT } from "@/lib/constants";

export type BusinessSettings = {
  name: string;
  legalName: string;
  tagline: string;
  about: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  country: string;
  hours: string;
  website: string;
  social: { facebook: string; instagram: string; tiktok: string; x: string; youtube: string };
};

export type CommerceSettings = {
  currency: string;
  secondaryCurrency: string;
  exchangeRate: number; // secondary per 1 base unit
  showSecondaryPrices: boolean;
  taxRate: number; // percent
  taxLabel: string;
  orderPrefix: string;
  minOrderAmount: number; // cents
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  timeSlots: string[];
  allowGuestCheckout: boolean;
  announcement: string;
};

export type PaymentSettings = {
  cashOnDelivery: boolean;
  payAtPickup: boolean;
  orangeMoney: { enabled: boolean; number: string; accountName: string; instructions: string };
  mtnMomo: { enabled: boolean; number: string; accountName: string; instructions: string };
  bankTransfer: { enabled: boolean; details: string };
  card: { enabled: boolean };
};

export type NotificationSettings = {
  adminPhone: string;
  adminEmail: string;
  notifyNewOrder: boolean;
  notifyNewBooking: boolean;
  notifyLowStock: boolean;
  customerOrderUpdates: boolean;
  defaultChannel: "WHATSAPP" | "SMS" | "EMAIL";
};

export type InvoiceSettings = { dueDays: number; terms: string; notes: string };

export type StoreSettings = {
  business: BusinessSettings;
  commerce: CommerceSettings;
  payments: PaymentSettings;
  notifications: NotificationSettings;
  invoice: InvoiceSettings;
};

export const DEFAULT_SETTINGS: StoreSettings = {
  business: {
    name: "REAP Farms",
    legalName: "REAP — Rural Empowerment & Agricultural Programs",
    tagline: "Fresh pork, live fish & aquaponic produce from Bentol City",
    about:
      "REAP empowers rural farmers, youth, women and entrepreneurs through skills-based training and a working farm. Every purchase supports training, jobs and food security in Liberia.",
    phone: "+231 77 000 0000",
    whatsapp: "+231770000000",
    email: "info@reapwestafrica.org",
    address: "REAP Farm, Bentol City",
    city: "Montserrado County",
    country: "Liberia",
    hours: "Mon – Sat, 8:00am – 5:00pm",
    website: "https://www.reapwestafrica.org",
    social: { facebook: "", instagram: "", tiktok: "", x: "", youtube: "" },
  },
  commerce: {
    currency: "USD",
    secondaryCurrency: "LRD",
    exchangeRate: 190,
    showSecondaryPrices: true,
    taxRate: 0,
    taxLabel: "GST",
    orderPrefix: "REAP",
    minOrderAmount: 0,
    deliveryEnabled: true,
    pickupEnabled: true,
    timeSlots: TIME_SLOTS_DEFAULT,
    allowGuestCheckout: true,
    announcement: "",
  },
  payments: {
    cashOnDelivery: true,
    payAtPickup: true,
    orangeMoney: {
      enabled: true,
      number: "+231 77 000 0000",
      accountName: "REAP Farms",
      instructions: "Dial *144#, choose Transfer, send the order total, then enter the transaction ID below.",
    },
    mtnMomo: {
      enabled: true,
      number: "+231 88 000 0000",
      accountName: "REAP Farms",
      instructions: "Dial *156#, choose Transfer Money, send the order total, then enter the transaction ID below.",
    },
    bankTransfer: { enabled: false, details: "" },
    card: { enabled: false },
  },
  notifications: {
    adminPhone: "",
    adminEmail: "",
    notifyNewOrder: true,
    notifyNewBooking: true,
    notifyLowStock: true,
    customerOrderUpdates: true,
    defaultChannel: "WHATSAPP",
  },
  invoice: {
    dueDays: 14,
    terms: "Payment due within 14 days. Pay by cash, Orange Money, MTN MoMo or bank transfer quoting the invoice number.",
    notes: "Thank you for supporting REAP farmers!",
  },
};

const SECTIONS = Object.keys(DEFAULT_SETTINGS) as (keyof StoreSettings)[];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override === undefined ? base : (override as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (!(k in out)) continue; // ignore unknown keys
    out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export const getSettings = cache(async (): Promise<StoreSettings> => {
  try {
    const rows = await db.select().from(settingsTable).where(inArray(settingsTable.key, SECTIONS));
    const result = structuredClone(DEFAULT_SETTINGS);
    for (const row of rows) {
      const key = row.key as keyof StoreSettings;
      (result as Record<string, unknown>)[key] = deepMerge(DEFAULT_SETTINGS[key], row.value);
    }
    return result;
  } catch (err) {
    console.error("Failed to load settings, using defaults", err);
    return structuredClone(DEFAULT_SETTINGS);
  }
});

export async function saveSettingsSection<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}
