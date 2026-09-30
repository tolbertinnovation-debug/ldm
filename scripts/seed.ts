/**
 * Seeds a realistic demo dataset for REAP: catalog, services, delivery zones,
 * staff, customers, ~90 days of orders/payments/deliveries, expenses,
 * marketing campaigns, promotions, livestock and message templates.
 *
 *   npm run db:seed            # refuses if data already exists
 *   npm run db:seed -- --force # wipes business data first
 *
 * Login after seeding: owner@reap.farm / ReapFarm#2026 (change it!)
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { DEFAULT_TEMPLATES } from "../src/lib/messaging/templates";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { hashPassword } from "../src/lib/auth/password";
import { calculatePricing } from "../src/lib/pricing";
import { lineTotal } from "../src/lib/money";
import { ORDER_STATUS_META } from "../src/lib/constants";

// Deterministic PRNG so demo data is stable between runs.
let seed = 20260928;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const token = () => crypto.randomUUID().replace(/-/g, "");
const cents = (d: number) => Math.round(d * 100);
const DAY = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type ProductSeed = {
  cat: string;
  name: string;
  unit: (typeof s.salesUnit.enumValues)[number];
  price: number;
  cost?: number;
  stock?: number;
  low?: number;
  short: string;
  description?: string;
  variableWeight?: boolean;
  minQty?: number;
  step?: number;
  maxQty?: number;
  featured?: boolean;
  compareAt?: number;
  pricingNote?: string;
  lead?: number;
  availability?: (typeof s.availability.enumValues)[number];
  delivery?: boolean;
  options?: s.ProductOptionGroup[];
  attributes?: Record<string, string>;
  tags?: string[];
  type?: "PRODUCT" | "SERVICE";
};

const CATEGORIES = [
  { slug: "live-pigs", name: "Live Pigs", icon: "piggy", description: "Healthy, farm-raised pigs — piglets, growers, finishers and breeding stock." },
  { slug: "whole-pigs", name: "Slaughtered Pigs", icon: "beef", description: "Whole and half dressed pigs, cleaned and ready for your event or shop." },
  { slug: "pork-cuts", name: "Pork by the Pound", icon: "ham", description: "Fresh cuts weighed to order — chops, ribs, belly, shoulder and more." },
  { slug: "live-fish", name: "Live & Fresh Fish", icon: "fish", description: "Tilapia and catfish raised in our aquaponics ponds, plus fingerlings for farmers." },
  { slug: "aquaponic-produce", name: "Aquaponic Produce", icon: "leaf", description: "Clean, pesticide-free greens and vegetables grown with fish-fed water." },
  { slug: "farm-goods", name: "Farm Goods & Inputs", icon: "wheat", description: "Eggs, feed, compost and other agricultural goods." },
  { slug: "services", name: "Services & Training", icon: "graduation", description: "Slaughter & processing, farm training, aquaponics setup and consultancy." },
] as const;

const WEIGHT_NOTE = "Priced per pound. We weigh your order when we cut it — final price may vary slightly.";

const PRODUCTS: ProductSeed[] = [
  // Live pigs
  { cat: "live-pigs", name: "Weaner Piglet (6–8 weeks)", unit: "HEAD", price: 45, cost: 22, stock: 24, low: 5, featured: true, short: "Strong, weaned piglets ready to start your own pig farm.", attributes: { Age: "6–8 weeks", Weight: "8–12 kg", Breed: "Large White × Landrace" }, options: [{ name: "Sex", required: false, choices: [{ label: "Any", priceDelta: 0 }, { label: "Female (gilt)", priceDelta: 500 }, { label: "Male", priceDelta: 0 }] }], tags: ["farmers", "breeding"], delivery: true },
  { cat: "live-pigs", name: "Grower Pig (3–4 months)", unit: "HEAD", price: 120, cost: 70, stock: 14, low: 3, short: "Growing pigs of 30–40 kg for fattening or backyard farms.", attributes: { Age: "3–4 months", Weight: "30–40 kg" } },
  { cat: "live-pigs", name: "Finisher Pig (6–8 months)", unit: "HEAD", price: 260, cost: 150, stock: 9, low: 2, featured: true, short: "Market-ready pigs of 80–100 kg — perfect for weddings, holidays and feasts.", attributes: { Age: "6–8 months", Weight: "80–100 kg" }, options: [{ name: "Slaughter & clean", required: false, choices: [{ label: "Live (no processing)", priceDelta: 0 }, { label: "Slaughter & clean", priceDelta: 2000 }, { label: "Slaughter, clean & cut", priceDelta: 3500 }] }] },
  { cat: "live-pigs", name: "Breeding Gilt", unit: "HEAD", price: 320, cost: 180, stock: 4, low: 1, short: "Selected young sow for breeding, vaccinated and dewormed.", attributes: { Age: "7–9 months", Status: "Vaccinated & dewormed" }, lead: 2 },
  { cat: "live-pigs", name: "Breeding Boar", unit: "HEAD", price: 380, cost: 210, stock: 2, low: 1, short: "Proven, healthy boar to improve your herd genetics.", lead: 3 },
  // Whole pigs
  { cat: "whole-pigs", name: "Whole Dressed Pig", unit: "LB", price: 2.75, cost: 1.6, stock: 900, low: 150, variableWeight: true, minQty: 100, step: 10, featured: true, short: "A whole pig, slaughtered, scalded and cleaned. Typically 120–160 lb.", pricingNote: "Order an estimated weight; we charge for the actual weight at pickup or delivery.", lead: 1, options: [{ name: "Preparation", required: true, choices: [{ label: "Whole", priceDelta: 0 }, { label: "Halved", priceDelta: 5 }, { label: "Cut into pieces", priceDelta: 15 }] }] },
  { cat: "whole-pigs", name: "Half Dressed Pig", unit: "LB", price: 2.95, cost: 1.65, stock: 600, low: 80, variableWeight: true, minQty: 50, step: 5, short: "Half a dressed pig — great for families and restaurants.", pricingNote: WEIGHT_NOTE, lead: 1 },
  { cat: "whole-pigs", name: "Roasting Piglet (dressed)", unit: "EACH", price: 85, cost: 45, stock: 6, low: 2, short: "Whole suckling piglet (20–30 lb) cleaned and ready to roast.", lead: 2 },
  // Pork by the pound
  { cat: "pork-cuts", name: "Pork Chops", unit: "LB", price: 4.5, cost: 2.2, stock: 140, low: 25, variableWeight: true, minQty: 1, step: 0.5, featured: true, short: "Tender bone-in chops, freshly cut.", pricingNote: WEIGHT_NOTE, options: [{ name: "Thickness", required: false, choices: [{ label: "Regular", priceDelta: 0 }, { label: "Thick cut", priceDelta: 0 }] }] },
  { cat: "pork-cuts", name: "Pork Spare Ribs", unit: "LB", price: 4.25, cost: 2.0, stock: 110, low: 20, variableWeight: true, minQty: 1, step: 0.5, featured: true, short: "Meaty ribs — perfect for grilling and pepper soup.", pricingNote: WEIGHT_NOTE },
  { cat: "pork-cuts", name: "Pork Belly", unit: "LB", price: 4.0, cost: 1.9, stock: 95, low: 20, variableWeight: true, minQty: 1, step: 0.5, short: "Rich, layered belly for roasting or frying.", pricingNote: WEIGHT_NOTE },
  { cat: "pork-cuts", name: "Pork Shoulder", unit: "LB", price: 3.75, cost: 1.8, stock: 120, low: 20, variableWeight: true, minQty: 1, step: 0.5, short: "Versatile shoulder meat for stews and slow cooking.", pricingNote: WEIGHT_NOTE },
  { cat: "pork-cuts", name: "Pork Leg (Ham)", unit: "LB", price: 3.75, cost: 1.8, stock: 130, low: 20, variableWeight: true, minQty: 2, step: 0.5, short: "Lean leg meat, bone-in.", pricingNote: WEIGHT_NOTE },
  { cat: "pork-cuts", name: "Minced Pork", unit: "LB", price: 3.5, cost: 1.7, stock: 60, low: 15, minQty: 1, step: 0.5, short: "Freshly minced pork for burgers, sauces and meatballs." },
  { cat: "pork-cuts", name: "Homemade Pork Sausage", unit: "LB", price: 5.0, cost: 2.4, stock: 40, low: 10, minQty: 1, step: 0.5, featured: true, short: "Our own recipe with local pepper and spices.", options: [{ name: "Style", required: false, choices: [{ label: "Fresh", priceDelta: 0 }, { label: "Smoked", priceDelta: 75 }] }] },
  { cat: "pork-cuts", name: "Pig Feet (Trotters)", unit: "LB", price: 2.0, cost: 0.9, stock: 80, low: 15, minQty: 1, step: 0.5, short: "Cleaned trotters for soups and stews." },
  { cat: "pork-cuts", name: "Pork Liver & Offal", unit: "LB", price: 2.25, cost: 1.0, stock: 50, low: 10, minQty: 1, step: 0.5, short: "Fresh liver, kidney and heart." },
  // Fish
  { cat: "live-fish", name: "Live Tilapia", unit: "KG", price: 4.0, cost: 2.0, stock: 220, low: 40, variableWeight: true, minQty: 1, step: 0.5, featured: true, short: "Live tilapia from our aquaponics ponds, 300–500 g each.", pricingNote: "Weighed at harvest.", options: [{ name: "Preparation", required: false, choices: [{ label: "Live", priceDelta: 0 }, { label: "Cleaned & gutted", priceDelta: 50 }, { label: "Cleaned & smoked", priceDelta: 150 }] }] },
  { cat: "live-fish", name: "Live Catfish", unit: "KG", price: 4.5, cost: 2.2, stock: 160, low: 30, variableWeight: true, minQty: 1, step: 0.5, short: "Live African catfish, 0.8–1.5 kg each.", pricingNote: "Weighed at harvest.", options: [{ name: "Preparation", required: false, choices: [{ label: "Live", priceDelta: 0 }, { label: "Cleaned & gutted", priceDelta: 50 }, { label: "Cleaned & smoked", priceDelta: 150 }] }] },
  { cat: "live-fish", name: "Tilapia Fingerlings (per 100)", unit: "HUNDRED", price: 15, cost: 6, stock: 40, low: 5, short: "Healthy mono-sex fingerlings to stock your pond.", tags: ["farmers"], delivery: false },
  { cat: "live-fish", name: "Catfish Fingerlings (per 100)", unit: "HUNDRED", price: 18, cost: 7, stock: 30, low: 5, short: "Fast-growing catfish juveniles.", tags: ["farmers"], delivery: false },
  // Aquaponic produce
  { cat: "aquaponic-produce", name: "Fresh Lettuce", unit: "EACH", price: 1.0, cost: 0.35, stock: 150, low: 20, featured: true, short: "Crisp aquaponic lettuce heads, harvested daily." },
  { cat: "aquaponic-produce", name: "Potato Greens", unit: "BUNCH", price: 0.5, cost: 0.15, stock: 120, low: 20, short: "Tender potato leaves for Liberian potato greens." },
  { cat: "aquaponic-produce", name: "Cassava Leaves", unit: "BUNCH", price: 0.5, cost: 0.15, stock: 100, low: 20, short: "Fresh cassava leaves, pounded on request.", options: [{ name: "Preparation", required: false, choices: [{ label: "Whole leaves", priceDelta: 0 }, { label: "Pounded", priceDelta: 25 }] }] },
  { cat: "aquaponic-produce", name: "Sweet Peppers", unit: "LB", price: 2.5, cost: 0.9, stock: 60, low: 10, minQty: 0.5, step: 0.5, short: "Colourful bell peppers." },
  { cat: "aquaponic-produce", name: "Hot Pepper", unit: "LB", price: 2.0, cost: 0.7, stock: 45, low: 8, minQty: 0.5, step: 0.5, short: "Fiery local pepper — a Liberian kitchen essential." },
  { cat: "aquaponic-produce", name: "Tomatoes", unit: "LB", price: 2.0, cost: 0.8, stock: 70, low: 10, minQty: 0.5, step: 0.5, short: "Juicy vine tomatoes." },
  { cat: "aquaponic-produce", name: "Cucumbers", unit: "EACH", price: 0.75, cost: 0.25, stock: 90, low: 15, short: "Crunchy cucumbers." },
  { cat: "aquaponic-produce", name: "Okra", unit: "LB", price: 1.5, cost: 0.5, stock: 50, low: 10, minQty: 0.5, step: 0.5, short: "Fresh okra for soups." },
  { cat: "aquaponic-produce", name: "Bitter Ball", unit: "LB", price: 1.5, cost: 0.5, stock: 40, low: 8, minQty: 0.5, step: 0.5, short: "Liberian garden eggs (bitter balls)." },
  { cat: "aquaponic-produce", name: "Herb Bundle (basil & mint)", unit: "BUNCH", price: 1.0, cost: 0.3, stock: 35, low: 5, short: "Fragrant basil and mint." },
  { cat: "aquaponic-produce", name: "Veggie Box (family size)", unit: "EACH", price: 12, cost: 5, stock: 20, low: 4, featured: true, compareAt: 15, short: "A weekly box of seasonal aquaponic vegetables for 4–6 people.", tags: ["subscription"] },
  // Farm goods
  { cat: "farm-goods", name: "Farm Fresh Eggs (tray of 30)", unit: "TRAY", price: 6.5, cost: 4.2, stock: 45, low: 8, featured: true, short: "Fresh eggs from local partner farmers." },
  { cat: "farm-goods", name: "Pig Grower Feed (25 kg)", unit: "BAG", price: 22, cost: 17, stock: 30, low: 6, short: "Balanced grower ration made at the REAP feed mill.", tags: ["farmers"] },
  { cat: "farm-goods", name: "Fish Feed Pellets (15 kg)", unit: "BAG", price: 25, cost: 19, stock: 25, low: 5, short: "Floating pellets for tilapia and catfish.", tags: ["farmers"] },
  { cat: "farm-goods", name: "Organic Compost (50 kg)", unit: "BAG", price: 8, cost: 2.5, stock: 60, low: 10, short: "Rich compost from our pig manure and plant waste — great for gardens." },
  { cat: "farm-goods", name: "Plantain Bunch", unit: "BUNCH", price: 5, cost: 3, stock: 25, low: 5, short: "Large bunch of ripe or green plantains.", options: [{ name: "Ripeness", required: false, choices: [{ label: "Green", priceDelta: 0 }, { label: "Ripe", priceDelta: 0 }] }] },
  { cat: "farm-goods", name: "Red Palm Oil (1 gallon)", unit: "GALLON", price: 7, cost: 4.5, stock: 30, low: 5, short: "Pure local red palm oil." },
];

const SERVICES: ProductSeed[] = [
  { cat: "services", type: "SERVICE", name: "Pig Slaughter & Processing", unit: "HEAD", price: 20, short: "Bring your pig — we slaughter, clean and cut it hygienically at our facility.", description: "Hygienic slaughter, scalding, cleaning and optional cutting to your specification. Same-day service when booked before 10am." },
  { cat: "services", type: "SERVICE", name: "Pig Farming Training (3 days)", unit: "PERSON", price: 50, featured: true, short: "Hands-on course: housing, feeding, breeding, health and pig business planning.", description: "Designed for youth, women and new farmers. Includes farm practicals, a starter business plan and a certificate. Group discounts for cooperatives." },
  { cat: "services", type: "SERVICE", name: "Aquaponics Training Workshop", unit: "PERSON", price: 40, featured: true, short: "Learn to raise fish and vegetables together in one water-saving system.", description: "Two-day practical workshop covering system design, fish care, plant nutrition and marketing your harvest." },
  { cat: "services", type: "SERVICE", name: "Aquaponics System Design & Installation", unit: "SESSION", price: 0, short: "We design and build aquaponic systems for homes, schools and businesses.", description: "Site visit, design, build and three months of follow-up support. Priced by quotation." },
  { cat: "services", type: "SERVICE", name: "Farm Consultation & Vet Visit", unit: "SESSION", price: 30, short: "An experienced REAP technician visits your farm to advise on health and production." },
  { cat: "services", type: "SERVICE", name: "Farmer Business & Financial Literacy Training", unit: "PERSON", price: 25, short: "Record-keeping, pricing, savings and leadership for rural entrepreneurs." },
  { cat: "services", type: "SERVICE", name: "Farm Tour (schools & groups)", unit: "PERSON", price: 5, short: "Guided tour of the pig unit, fish ponds and aquaponics greenhouse." },
];

const ZONES = [
  { name: "Bentol City & Careysburg", description: "Bentol, Careysburg, Todee junction", fee: 2, freeOver: 50, estimatedTime: "Same day" },
  { name: "Paynesville", description: "ELWA, Red Light, Duport Road, Rehab, Joe Bar, SKD", fee: 5, freeOver: 100, estimatedTime: "Same day" },
  { name: "Congo Town & Sinkor", description: "Congo Town, Old Road, Sinkor, 72nd, Airfield", fee: 6, freeOver: 120, estimatedTime: "Same / next day" },
  { name: "Central Monrovia", description: "Broad Street, Mamba Point, Waterside, Snapper Hill", fee: 7, freeOver: 150, estimatedTime: "Next day" },
  { name: "Gardnersville & Barnersville", description: "Gardnersville, Barnersville, New Georgia, Caldwell", fee: 7, freeOver: 150, estimatedTime: "Next day" },
  { name: "Brewerville & Virginia", description: "Brewerville, Virginia, Po River", fee: 10, freeOver: null, estimatedTime: "1–2 days" },
  { name: "Kakata & Margibi", description: "Kakata, Harbel, RIA area", fee: 15, freeOver: null, estimatedTime: "1–2 days" },
];

const FIRST = ["Musu", "Jestina", "Comfort", "Kebeh", "Esther", "Hawa", "Ma Gbeme", "Oretha", "Satta", "Mamie", "Joseph", "Emmanuel", "Moses", "Prince", "Varney", "Samuel", "Alfred", "Boimah", "Momo", "Jefferson", "Patience", "Precious", "Blessing", "Fatu", "Siah", "Koffa", "Nyema", "Tarnue", "Garmai", "Wleh"];
const LAST = ["Kollie", "Johnson", "Doe", "Freeman", "Sirleaf", "Kamara", "Kpoto", "Weah", "Tubman", "Flomo", "Cooper", "Harris", "Sackor", "Gray", "Tokpa", "Kromah", "Toe", "Tarr", "Nagbe", "Dennis"];
const BUSINESSES = [
  { name: "Mama Kebeh's Cook Shop", type: "RESTAURANT" },
  { name: "Royal Grand Hotel Kitchen", type: "HOTEL" },
  { name: "Red Light Market Stall 14", type: "RETAILER" },
  { name: "St. Peter's Catholic School", type: "INSTITUTION" },
  { name: "Paynesville Pork Joint", type: "RESTAURANT" },
  { name: "Bong Farmers Cooperative", type: "FARMER" },
  { name: "Sinkor Supermarket", type: "RETAILER" },
  { name: "Hope Rising NGO", type: "NGO" },
  { name: "Duport Road Wholesale", type: "WHOLESALER" },
  { name: "Mamba Point Grill", type: "RESTAURANT" },
] as const;
const AREAS = ["ELWA Junction", "Red Light", "Duport Road", "Congo Town", "Sinkor 15th Street", "Old Road", "Gardnersville", "Barnersville", "Broad Street", "Bentol", "Careysburg", "Rehab", "Joe Bar", "Airfield"];
const LANDMARKS = ["opposite the Total station", "behind the Catholic church", "near the police depot", "next to the Lonestar tower", "by the big mango tree", "across from the school", "near the market entrance"];

async function wipe() {
  const tables = [
    "jobs", "messages", "broadcasts", "social_posts", "campaign_metrics", "invoice_items", "invoices", "payments", "deliveries",
    "order_events", "order_items", "orders", "promotions", "campaigns", "bookings", "cart_items", "carts", "stock_movements",
    "livestock_events", "livestock", "products", "categories", "customer_addresses", "customers", "delivery_zones",
    "pickup_locations", "expenses", "message_templates", "settings", "audit_logs", "sessions", "verification_codes",
    "rate_limits", "media", "users",
  ];
  await db.execute(sql.raw(`truncate ${tables.join(", ")} restart identity cascade`));
  await db.execute(sql`alter sequence order_number_seq restart with 10001`);
  await db.execute(sql`alter sequence invoice_number_seq restart with 1001`);
  await db.execute(sql`alter sequence booking_number_seq restart with 501`);
}

async function main() {
  const force = process.argv.includes("--force");
  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from users`)).rows as { n: number }[];
  if (n > 0 && !force) {
    console.log("Database already has data. Run with --force to wipe and reseed (destroys data).");
    return;
  }
  if (process.env.NODE_ENV === "production" && force && process.env.ALLOW_DB_RESET !== "true") {
    throw new Error("Refusing to wipe production data. Set ALLOW_DB_RESET=true to override.");
  }
  if (force) await wipe();
  console.log("Seeding REAP demo data…");
  const now = Date.now();

  // Settings & templates ----------------------------------------------------
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
    await db.insert(s.settings).values({ key, value: DEFAULT_SETTINGS[key] });
  }
  await db.insert(s.messageTemplates).values(DEFAULT_TEMPLATES.map((t) => ({ ...t })));

  // Staff -------------------------------------------------------------------
  const password = await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "ReapFarm#2026");
  const staffPassword = await hashPassword(process.env.SEED_STAFF_PASSWORD ?? "ReapStaff#2026");
  const staff = await db
    .insert(s.users)
    .values([
      { name: "REAP Owner", email: "owner@reap.farm", phone: "+231770000001", role: "OWNER", passwordHash: password },
      { name: "Grace Kollie", email: "manager@reap.farm", phone: "+231770000002", role: "MANAGER", passwordHash: staffPassword },
      { name: "Prince Johnson", email: "sales@reap.farm", phone: "+231880000003", role: "SALES", passwordHash: staffPassword },
      { name: "Fatu Kamara", email: "accounts@reap.farm", phone: "+231770000004", role: "ACCOUNTANT", passwordHash: staffPassword },
      { name: "Blessing Weah", email: "marketing@reap.farm", phone: "+231880000005", role: "MARKETING", passwordHash: staffPassword },
      { name: "Moses Flomo", email: "farm@reap.farm", phone: "+231770000006", role: "INVENTORY", passwordHash: staffPassword },
      { name: "Varney Toe", email: "driver1@reap.farm", phone: "+231880000007", role: "DRIVER", passwordHash: staffPassword },
      { name: "Samuel Tokpa", email: "driver2@reap.farm", phone: "+231770000008", role: "DRIVER", passwordHash: staffPassword },
    ])
    .returning();
  const owner = staff[0]!;
  const salesUser = staff[2]!;
  const drivers = staff.filter((u) => u.role === "DRIVER");

  // Places --------------------------------------------------------------------
  const zones = await db
    .insert(s.deliveryZones)
    .values(ZONES.map((z, i) => ({ ...z, fee: cents(z.fee), freeOver: z.freeOver ? cents(z.freeOver) : null, sortOrder: i })))
    .returning();
  const [farm] = await db
    .insert(s.pickupLocations)
    .values([
      { name: "REAP Farm — Bentol City", address: "REAP Farm, off Bentol–Careysburg Road, Bentol City, Montserrado", hours: "Mon – Sat, 8:00am – 5:00pm", phone: "+231770000000", instructions: "Ask for the sales office at the farm gate. Live animals are loaded for you.", lat: 6.4406, lng: -10.6436 },
      { name: "REAP Market Stand — Paynesville", address: "ELWA Junction, Paynesville", hours: "Tue, Thu & Sat, 9:00am – 3:00pm", phone: "+231880000000", instructions: "Pork cuts, fish and vegetables only.", lat: 6.2688, lng: -10.7097 },
    ])
    .returning();

  // Catalog ---------------------------------------------------------------------
  const cats = await db
    .insert(s.categories)
    .values(CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })))
    .returning();
  const catBySlug = new Map(cats.map((c) => [c.slug, c]));
  const slugify = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const productRows = await db
    .insert(s.products)
    .values(
      [...PRODUCTS, ...SERVICES].map((p, i) => ({
        type: p.type ?? "PRODUCT",
        categoryId: catBySlug.get(p.cat)!.id,
        name: p.name,
        slug: slugify(p.name),
        sku: `${p.cat.split("-").map((w) => w[0]).join("").toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
        shortDescription: p.short,
        description: p.description ?? `${p.short} Raised and prepared by the REAP team in Bentol City, Liberia. Every purchase supports farmer training and jobs for youth and women.`,
        unit: p.unit,
        price: cents(p.price),
        compareAtPrice: p.compareAt ? cents(p.compareAt) : null,
        costPrice: p.cost !== undefined ? cents(p.cost) : null,
        pricingNote: p.pricingNote ?? null,
        variableWeight: p.variableWeight ?? false,
        minQty: p.minQty ?? 1,
        qtyStep: p.step ?? 1,
        maxQty: p.maxQty ?? null,
        trackInventory: (p.type ?? "PRODUCT") === "PRODUCT",
        stockQty: p.stock ?? 0,
        lowStockThreshold: p.low ?? 0,
        availability: p.availability ?? "IN_STOCK",
        leadTimeDays: p.lead ?? 0,
        allowDelivery: p.delivery ?? true,
        featured: p.featured ?? false,
        options: p.options ?? [],
        attributes: p.attributes ?? {},
        tags: p.tags ?? [],
        sortOrder: i,
      })),
    )
    .returning();
  const sellable = productRows.filter((p) => p.type === "PRODUCT");
  for (const p of sellable) {
    await db.insert(s.stockMovements).values({ productId: p.id, type: "RECEIVE", quantity: p.stockQty, balanceAfter: p.stockQty, reference: "Opening stock", createdById: owner.id, createdAt: new Date(now - 95 * DAY) });
  }

  // Livestock register ----------------------------------------------------------
  const bySlug = new Map(productRows.map((p) => [p.slug, p]));
  const pigProducts = ["weaner-piglet-6-8-weeks", "grower-pig-3-4-months", "finisher-pig-6-8-months", "breeding-gilt"];
  const animals: (typeof s.livestock.$inferInsert)[] = [];
  for (let i = 1; i <= 36; i++) {
    const slug = pigProducts[i % pigProducts.length]!;
    const weight = slug.startsWith("weaner") ? between(8, 12) : slug.startsWith("grower") ? between(30, 42) : slug.startsWith("finisher") ? between(78, 102) : between(90, 120);
    animals.push({
      tag: `PIG-${String(i).padStart(3, "0")}`,
      species: "PIG",
      breed: pick(["Large White", "Landrace", "Large White × Landrace", "Duroc cross"]),
      sex: pick(["MALE", "FEMALE"] as const),
      birthDate: isoDate(new Date(now - between(50, 260) * DAY)),
      source: "BORN_ON_FARM",
      weightKg: weight,
      location: `Pen ${String.fromCharCode(65 + (i % 6))}`,
      status: i % 5 === 0 ? "GROWING" : "AVAILABLE",
      productId: bySlug.get(slug)!.id,
    });
  }
  animals.push(
    { tag: "POND-01", species: "FISH", breed: "Nile tilapia", sex: "MIXED", headCount: 1800, weightKg: 0.35, location: "Pond 1", status: "AVAILABLE", productId: bySlug.get("live-tilapia")!.id, source: "BORN_ON_FARM" },
    { tag: "POND-02", species: "FISH", breed: "African catfish", sex: "MIXED", headCount: 950, weightKg: 1.1, location: "Pond 2", status: "AVAILABLE", productId: bySlug.get("live-catfish")!.id, source: "PURCHASED" },
    { tag: "TANK-03", species: "FISH", breed: "Nile tilapia (fingerlings)", sex: "MIXED", headCount: 4000, weightKg: 0.02, location: "Hatchery tank 3", status: "GROWING", productId: bySlug.get("tilapia-fingerlings-per-100")!.id, source: "BORN_ON_FARM" },
  );
  const animalRows = await db.insert(s.livestock).values(animals).returning();
  for (const a of animalRows.slice(0, 12)) {
    await db.insert(s.livestockEvents).values([
      { animalId: a.id, type: "VACCINATED", note: "Routine vaccination (swine fever & erysipelas)", createdById: staff[5]!.id, createdAt: new Date(now - 30 * DAY) },
      { animalId: a.id, type: "WEIGHED", weightKg: a.weightKg, createdById: staff[5]!.id, createdAt: new Date(now - 3 * DAY) },
    ]);
  }

  // Marketing: campaigns & promotions ------------------------------------------------
  const campaignRows = await db
    .insert(s.campaigns)
    .values([
      { name: "Independence Day Pork Special", channel: "FACEBOOK", objective: "Drive July 26 whole-pig orders", status: "COMPLETED", startDate: isoDate(new Date(now - 80 * DAY)), endDate: isoDate(new Date(now - 60 * DAY)), budget: cents(150), utmCampaign: "july26-pork", landingPath: "/shop/category/whole-pigs", targetAudience: "Monrovia, 25–55, families & event planners", createdById: owner.id },
      { name: "ELBC Radio — Fresh Fish Friday", channel: "RADIO", objective: "Awareness for live tilapia", status: "ACTIVE", startDate: isoDate(new Date(now - 40 * DAY)), endDate: isoDate(new Date(now + 20 * DAY)), budget: cents(300), utmCampaign: "radio-fish-friday", landingPath: "/shop/category/live-fish", targetAudience: "Greater Monrovia listeners", notes: "Listeners quote code FISHFRIDAY", createdById: owner.id },
      { name: "WhatsApp Restaurant Outreach", channel: "WHATSAPP", objective: "Win restaurant & hotel accounts", status: "ACTIVE", startDate: isoDate(new Date(now - 30 * DAY)), budget: cents(40), utmCampaign: "wa-restaurants", landingPath: "/shop/category/pork-cuts", targetAudience: "Cook shops, hotels, restaurants", createdById: staff[4]!.id },
      { name: "Instagram Aquaponics Stories", channel: "INSTAGRAM", objective: "Grow veggie box buyers", status: "ACTIVE", startDate: isoDate(new Date(now - 25 * DAY)), budget: cents(120), utmCampaign: "ig-aquaponics", landingPath: "/shop/category/aquaponic-produce", targetAudience: "Young professionals in Sinkor & Congo Town", createdById: staff[4]!.id },
      { name: "Farmer Training Flyers — Bong & Margibi", channel: "PRINT", objective: "Fill training courses", status: "PLANNED", startDate: isoDate(new Date(now + 7 * DAY)), budget: cents(80), utmCampaign: "flyers-training", landingPath: "/services", createdById: staff[4]!.id },
    ])
    .returning();
  for (const c of campaignRows) {
    if (c.status === "PLANNED" || !c.startDate) continue;
    const start = new Date(`${c.startDate}T00:00:00Z`).getTime();
    const end = Math.min(now, c.endDate ? new Date(`${c.endDate}T00:00:00Z`).getTime() : now);
    for (let t = start; t <= end; t += DAY) {
      const digital = c.channel === "FACEBOOK" || c.channel === "INSTAGRAM";
      const impressions = digital ? between(600, 2400) : c.channel === "RADIO" ? between(3000, 8000) : between(40, 120);
      await db.insert(s.campaignMetrics).values({
        campaignId: c.id,
        date: isoDate(new Date(t)),
        spend: Math.round((c.budget / Math.max(1, (end - start) / DAY + 1)) * (0.7 + rand() * 0.6)),
        impressions,
        clicks: digital ? Math.round(impressions * (0.012 + rand() * 0.02)) : c.channel === "WHATSAPP" ? between(5, 25) : between(0, 8),
        leads: between(0, 4),
      });
    }
  }
  const promoRows = await db
    .insert(s.promotions)
    .values([
      { name: "Welcome 10%", code: "WELCOME10", description: "10% off your first order", type: "PERCENT", value: 10, maxDiscount: cents(20), firstOrderOnly: true, active: true },
      { name: "Fish Friday", code: "FISHFRIDAY", description: "15% off fish (radio listeners)", type: "PERCENT", value: 15, scope: "CATEGORIES", targetIds: [catBySlug.get("live-fish")!.id], campaignId: campaignRows[1]!.id, active: true },
      { name: "Free delivery over $60", code: "FREEDEL", description: "Free delivery on orders over $60", type: "FREE_DELIVERY", value: 0, minSubtotal: cents(60), active: true },
      { name: "Restaurant $10 off", code: "CHEF10", description: "$10 off orders over $100 for restaurants", type: "FIXED", value: cents(10), minSubtotal: cents(100), campaignId: campaignRows[2]!.id, active: true, perCustomerLimit: 3 },
      { name: "July 26 Pork", code: "JULY26", description: "8% off whole pigs", type: "PERCENT", value: 8, scope: "CATEGORIES", targetIds: [catBySlug.get("whole-pigs")!.id], campaignId: campaignRows[0]!.id, active: false, endsAt: new Date(now - 60 * DAY) },
    ])
    .returning();

  // Customers ----------------------------------------------------------------------
  const customerValues: (typeof s.customers.$inferInsert)[] = [];
  for (let i = 0; i < 64; i++) {
    const biz = i < BUSINESSES.length ? BUSINESSES[i] : null;
    const phone = `+231${pick(["77", "88", "55"])}${String(1000000 + i * 7919).slice(-7)}`;
    const name = biz ? biz.name : `${pick(FIRST)} ${pick(LAST)}`;
    const optIn = rand() > 0.35;
    customerValues.push({
      name,
      phone,
      email: rand() > 0.5 ? `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/(^\.|\.$)/g, "")}${i}@example.com` : null,
      type: (biz?.type ?? "INDIVIDUAL") as (typeof s.customerType.enumValues)[number],
      companyName: biz ? biz.name : null,
      tags: biz ? ["business"] : rand() > 0.8 ? ["vip"] : [],
      source: pick(["Facebook", "Word of mouth", "Radio", "WhatsApp", "Walk-in", "Website"]),
      preferredChannel: pick(["WHATSAPP", "WHATSAPP", "SMS", "EMAIL"] as const),
      marketingWhatsapp: optIn,
      marketingSms: optIn && rand() > 0.3,
      marketingEmail: optIn && rand() > 0.5,
      discountPercent: biz && (biz.type === "WHOLESALER" || biz.type === "HOTEL") ? 5 : 0,
      createdAt: new Date(now - between(5, 110) * DAY),
    });
  }
  const customerRows = await db.insert(s.customers).values(customerValues).returning();
  for (const c of customerRows) {
    const zone = pick(zones);
    await db.insert(s.customerAddresses).values({
      customerId: c.id,
      label: c.companyName ? "Business" : "Home",
      recipientName: c.name,
      phone: c.phone,
      line1: `${between(1, 99)} ${pick(["Main Street", "Old Road", "Tubman Boulevard", "Duport Road", "Somalia Drive"])}`,
      area: pick(AREAS),
      city: "Monrovia",
      county: "Montserrado",
      landmark: pick(LANDMARKS),
      zoneId: zone.id,
      isDefault: true,
    });
  }
  // A demo customer account
  const [demoUser] = await db
    .insert(s.users)
    .values({ name: "Comfort Doe", email: "customer@reap.farm", phone: "+231775550123", role: "CUSTOMER", passwordHash: await hashPassword("Customer#2026") })
    .returning();
  const [demoCustomer] = await db
    .insert(s.customers)
    .values({ name: "Comfort Doe", phone: "+231775550123", email: "customer@reap.farm", userId: demoUser!.id, marketingWhatsapp: true, preferredChannel: "WHATSAPP", source: "Website" })
    .returning();
  customerRows.push(demoCustomer!);

  // Orders over the last 90 days -----------------------------------------------------
  const statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "CANCELLED"] as const;
  const channels = ["WEB", "WEB", "WEB", "WHATSAPP", "WHATSAPP", "PHONE", "WALK_IN", "SOCIAL"] as const;
  let orderSeq = 10001;
  const orderCount = 260;
  for (let i = 0; i < orderCount; i++) {
    const ageDays = Math.floor(Math.pow(rand(), 1.3) * 90);
    const createdAt = new Date(now - ageDays * DAY - between(0, 10) * 3600_000);
    const customer = pick(customerRows);
    const isRecent = ageDays <= 2;
    let status: (typeof s.orderStatus.enumValues)[number] = isRecent ? pick(["PENDING", "CONFIRMED", "PROCESSING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"] as const) : pick(statuses);
    const fulfillmentType = rand() > 0.45 ? "DELIVERY" : "PICKUP";
    if (fulfillmentType === "PICKUP" && status === "OUT_FOR_DELIVERY") status = "READY";

    const business = customer.type !== "INDIVIDUAL";
    const nItems = between(1, business ? 5 : 3);
    const chosen = new Map<string, (typeof productRows)[number]>();
    while (chosen.size < nItems) {
      const p = pick(sellable);
      chosen.set(p.id, p);
    }
    const lines = [...chosen.values()].map((p) => {
      let q = p.minQty;
      if (p.unit === "LB" || p.unit === "KG") q = p.minQty >= 50 ? between(p.minQty, p.minQty + 60) : between(2, business ? 30 : 8) + (rand() > 0.5 ? 0.5 : 0);
      else q = between(1, business ? 10 : 3);
      if (p.unit === "HEAD") q = between(1, business ? 3 : 1);
      const opt = p.options[0] && rand() > 0.5 ? p.options[0].choices[between(0, p.options[0].choices.length - 1)]! : null;
      const options = opt ? [{ group: p.options[0]!.name, choice: opt.label, priceDelta: opt.priceDelta }] : p.options[0]?.required ? [{ group: p.options[0].name, choice: p.options[0].choices[0]!.label, priceDelta: p.options[0].choices[0]!.priceDelta }] : [];
      const unitPrice = p.price + options.reduce((a, o) => a + o.priceDelta, 0);
      return { p, q, options, unitPrice };
    });
    const zone = fulfillmentType === "DELIVERY" ? pick(zones) : null;
    const campaign = rand() > 0.8 ? pick(campaignRows.filter((c) => c.status !== "PLANNED")) : null;
    const promo = rand() > 0.88 ? pick(promoRows.filter((p) => p.type !== "FREE_DELIVERY")) : null;
    const pricing = calculatePricing({
      lines: lines.map((l) => ({ productId: l.p.id, categoryId: l.p.categoryId, unitPrice: l.unitPrice, quantity: l.q, taxable: true })),
      promotion: promo ? { ...promo, active: true, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null, firstOrderOnly: false, minSubtotal: 0 } : null,
      deliveryFee: zone?.fee ?? 0,
      freeDeliveryOver: zone?.freeOver ?? null,
      customerDiscountPercent: customer.discountPercent,
    });
    const paid = status === "COMPLETED" ? pricing.total : status === "CANCELLED" ? 0 : rand() > 0.6 ? pricing.total : 0;
    const address = zone
      ? { recipientName: customer.name, phone: customer.phone, line1: `${between(1, 99)} ${pick(["Main Street", "Old Road", "Tubman Boulevard"])}`, area: pick(AREAS), city: "Monrovia", county: "Montserrado", landmark: pick(LANDMARKS) }
      : null;
    const number = `REAP-${orderSeq++}`;
    const channel = business && rand() > 0.5 ? "WHOLESALE" : pick(channels);
    const [order] = await db
      .insert(s.orders)
      .values({
        number,
        customerId: customer.id,
        status,
        fulfillmentType,
        channel,
        contactName: customer.name,
        contactPhone: customer.phone!,
        contactEmail: customer.email,
        deliveryZoneId: zone?.id ?? null,
        deliveryAddress: address,
        pickupLocationId: zone ? null : farm!.id,
        scheduledDate: isoDate(new Date(createdAt.getTime() + DAY)),
        timeSlot: pick(DEFAULT_SETTINGS.commerce.timeSlots),
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        deliveryFee: pricing.deliveryFee,
        taxTotal: pricing.taxTotal,
        total: pricing.total,
        amountPaid: paid,
        paymentStatus: paid >= pricing.total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID",
        paymentMethod: pick(["CASH", "ORANGE_MONEY", "MTN_MOMO", "CASH", "ORANGE_MONEY"] as const),
        promotionId: pricing.promotionApplied ? promo!.id : null,
        promoCode: pricing.promotionApplied ? promo!.code : null,
        utmSource: campaign ? campaign.channel.toLowerCase() : null,
        utmCampaign: campaign?.utmCampaign ?? null,
        campaignId: campaign?.id ?? (pricing.promotionApplied ? promo!.campaignId : null),
        trackingToken: token(),
        placedById: channel === "WEB" ? null : salesUser.id,
        confirmedAt: status !== "PENDING" ? new Date(createdAt.getTime() + 3600_000) : null,
        completedAt: status === "COMPLETED" ? new Date(createdAt.getTime() + between(4, 30) * 3600_000) : null,
        cancelledAt: status === "CANCELLED" ? new Date(createdAt.getTime() + 7200_000) : null,
        cancelReason: status === "CANCELLED" ? pick(["Customer changed mind", "Could not reach customer", "Out of stock"]) : null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    await db.insert(s.orderItems).values(
      lines.map((l, idx) => ({
        orderId: order!.id,
        productId: l.p.id,
        name: l.p.name,
        sku: l.p.sku,
        unit: l.p.unit,
        variableWeight: l.p.variableWeight,
        unitPrice: l.unitPrice,
        quantity: l.q,
        options: l.options,
        lineTotal: pricing.lineTotals[idx] ?? lineTotal(l.unitPrice, l.q),
        unitCost: l.p.costPrice,
        createdAt,
      })),
    );
    await db.insert(s.orderEvents).values({ orderId: order!.id, type: "STATUS", status: "PENDING", message: "Order placed", isPublic: true, createdAt });
    if (status !== "PENDING") {
      await db.insert(s.orderEvents).values({ orderId: order!.id, type: "STATUS", status, message: status === "COMPLETED" ? (fulfillmentType === "DELIVERY" ? "Delivered" : "Picked up") : ORDER_STATUS_META[status].label, isPublic: true, actorId: salesUser.id, createdAt: new Date(createdAt.getTime() + 3 * 3600_000) });
    }
    if (fulfillmentType === "DELIVERY") {
      const driver = pick(drivers);
      const dStatus = status === "COMPLETED" ? "DELIVERED" : status === "CANCELLED" ? "FAILED" : status === "OUT_FOR_DELIVERY" ? "IN_TRANSIT" : status === "PENDING" ? "UNASSIGNED" : "ASSIGNED";
      await db.insert(s.deliveries).values({
        orderId: order!.id,
        driverId: dStatus === "UNASSIGNED" ? null : driver.id,
        status: dStatus,
        assignedAt: dStatus === "UNASSIGNED" ? null : new Date(createdAt.getTime() + 2 * 3600_000),
        deliveredAt: dStatus === "DELIVERED" ? order!.completedAt : null,
        recipientName: dStatus === "DELIVERED" ? customer.name : null,
        codCollected: dStatus === "DELIVERED" && order!.paymentMethod === "CASH" ? pricing.total : 0,
        createdAt,
      });
    }
    if (paid > 0) {
      const method = order!.paymentMethod!;
      await db.insert(s.payments).values({
        reference: `PAY-${token().slice(0, 8).toUpperCase()}`,
        orderId: order!.id,
        customerId: customer.id,
        method,
        status: "SUCCEEDED",
        amount: paid,
        currency: "USD",
        provider: "manual",
        providerRef: method === "CASH" ? null : `TX${between(10000000, 99999999)}`,
        receivedById: salesUser.id,
        paidAt: order!.completedAt ?? new Date(createdAt.getTime() + 3600_000),
        createdAt,
      });
    }
  }
  // Refresh denormalised customer stats
  await db.execute(sql`
    update customers c set orders_count = s.cnt, total_spent = s.spent, last_order_at = s.last_at
    from (select customer_id, count(*)::int cnt, sum(total)::int spent, max(created_at) last_at from orders where status <> 'CANCELLED' group by 1) s
    where c.id = s.customer_id
  `);
  await db.execute(sql`
    update promotions p set usage_count = s.n from (select promotion_id, count(*)::int n from orders where promotion_id is not null and status <> 'CANCELLED' group by 1) s
    where p.id = s.promotion_id
  `);
  await db.execute(sql.raw(`alter sequence order_number_seq restart with ${orderSeq}`));

  // A pending mobile money payment awaiting verification
  const [pendingOrder] = (await db.execute(sql`select id, customer_id, total from orders where status = 'PENDING' and amount_paid = 0 limit 1`)).rows as { id: string; customer_id: string; total: number }[];
  if (pendingOrder) {
    await db.insert(s.payments).values({ reference: "PAY-DEMO0001", orderId: pendingOrder.id, customerId: pendingOrder.customer_id, method: "ORANGE_MONEY", status: "PENDING", amount: pendingOrder.total, currency: "USD", provider: "manual", providerRef: "OM2609281234", payerPhone: "+231775550123", note: "Customer-submitted transaction ID" });
  }

  // Invoices for business customers ---------------------------------------------------
  const bizOrders = (await db.execute(sql`
    select o.id, o.number, o.customer_id, o.subtotal, o.delivery_fee, o.discount_total, o.tax_total, o.total, o.amount_paid, o.created_at
    from orders o join customers c on c.id = o.customer_id
    where c.type <> 'INDIVIDUAL' and o.status <> 'CANCELLED' order by o.created_at desc limit 12
  `)).rows as { id: string; customer_id: string; subtotal: number; delivery_fee: number; discount_total: number; tax_total: number; total: number; amount_paid: number; created_at: Date }[];
  let invSeq = 1001;
  for (const o of bizOrders) {
    const issue = isoDate(new Date(o.created_at));
    const due = isoDate(new Date(new Date(o.created_at).getTime() + 14 * DAY));
    const [inv] = await db
      .insert(s.invoices)
      .values({
        number: `INV-${invSeq++}`,
        customerId: o.customer_id,
        orderId: o.id,
        status: o.amount_paid >= o.total ? "PAID" : o.amount_paid > 0 ? "PARTIALLY_PAID" : "SENT",
        issueDate: issue,
        dueDate: due,
        subtotal: o.subtotal + o.delivery_fee,
        discountTotal: o.discount_total,
        taxTotal: o.tax_total,
        total: o.total,
        amountPaid: o.amount_paid,
        notes: DEFAULT_SETTINGS.invoice.notes,
        terms: DEFAULT_SETTINGS.invoice.terms,
        sentAt: new Date(o.created_at),
        createdById: staff[3]!.id,
      })
      .returning();
    const items = (await db.execute(sql`select product_id, name, unit, quantity, unit_price, line_total from order_items where order_id = ${o.id}`)).rows as { product_id: string; name: string; unit: string; quantity: string; unit_price: number; line_total: number }[];
    await db.insert(s.invoiceItems).values(
      items.map((it, idx) => ({ invoiceId: inv!.id, productId: it.product_id, description: it.name, unit: it.unit.toLowerCase(), quantity: Number(it.quantity), unitPrice: it.unit_price, lineTotal: it.line_total, sortOrder: idx })),
    );
    if (o.delivery_fee > 0) await db.insert(s.invoiceItems).values({ invoiceId: inv!.id, description: "Delivery", unit: "trip", quantity: 1, unitPrice: o.delivery_fee, lineTotal: o.delivery_fee, sortOrder: items.length });
  }
  await db.execute(sql.raw(`alter sequence invoice_number_seq restart with ${invSeq}`));

  // Expenses -----------------------------------------------------------------------------
  const expenseTemplates: [string, string, string, number, number][] = [
    ["Animal feed", "Maize & soybean meal for pig feed", "Duport Road Feed Store", 180, 320],
    ["Fish feed", "Floating fish pellets", "Aqua Supplies Liberia", 90, 180],
    ["Veterinary & medicine", "Vaccines & dewormers", "Monrovia Vet Pharmacy", 30, 120],
    ["Labour & wages", "Casual farm labour (weekly)", "Farm workers", 120, 220],
    ["Fuel & transport", "Delivery truck fuel", "Total station Paynesville", 40, 90],
    ["Electricity & generator", "Generator diesel & LEC bill", "LEC / fuel", 50, 110],
    ["Packaging", "Meat bags, ice & crates", "Waterside market", 15, 45],
    ["Slaughter & processing", "Knives, scalding gas, cleaning", "Various", 20, 60],
    ["Marketing & advertising", "Facebook boost / radio spot", "Meta / ELBC", 20, 80],
    ["Communication & data", "Lonestar & Orange data bundles", "Lonestar Cell MTN", 10, 25],
    ["Bank & mobile money fees", "Orange Money / MoMo charges", "Orange / MTN", 5, 15],
    ["Equipment & repairs", "Pump repair for aquaponics", "Local technician", 25, 150],
  ];
  const expenseRows: (typeof s.expenses.$inferInsert)[] = [];
  for (let week = 0; week < 13; week++) {
    for (const [category, description, vendor, min, max] of expenseTemplates) {
      if (rand() > 0.55) continue;
      expenseRows.push({
        date: isoDate(new Date(now - (week * 7 + between(0, 6)) * DAY)),
        category,
        description,
        vendor,
        amount: cents(between(min, max)),
        paymentMethod: pick(["CASH", "CASH", "ORANGE_MONEY", "MTN_MOMO", "BANK_TRANSFER"] as const),
        createdById: staff[3]!.id,
      });
    }
  }
  await db.insert(s.expenses).values(expenseRows);

  // Bookings -------------------------------------------------------------------------------
  const services = productRows.filter((p) => p.type === "SERVICE");
  for (let i = 0; i < 9; i++) {
    const c = pick(customerRows);
    const svc = pick(services);
    await db.insert(s.bookings).values({
      number: `BK-${501 + i}`,
      serviceId: svc.id,
      serviceName: svc.name,
      customerId: c.id,
      contactName: c.name,
      contactPhone: c.phone!,
      contactEmail: c.email,
      preferredDate: isoDate(new Date(now + between(-10, 20) * DAY)),
      preferredTime: pick(["Morning", "Afternoon"]),
      participants: svc.unit === "PERSON" ? between(1, 12) : 1,
      details: pick(["We are a youth group from Kakata.", "Need 2 pigs processed for a funeral.", "Interested in a small home system.", "Our cooperative wants training for 10 members."]),
      status: pick(["REQUESTED", "REQUESTED", "CONFIRMED", "COMPLETED"] as const),
      quotedAmount: svc.price ? svc.price * (svc.unit === "PERSON" ? between(1, 12) : 1) : null,
    });
  }
  await db.execute(sql`alter sequence booking_number_seq restart with 510`);

  // Social posts & broadcasts -------------------------------------------------------------------
  await db.insert(s.socialPosts).values([
    { content: "🐖 Fresh pork chops and ribs cut to order this week! Delivery across Monrovia. Order on WhatsApp or online.", link: "https://shop.reapwestafrica.org/shop/category/pork-cuts?utm_source=facebook&utm_medium=social&utm_campaign=wa-restaurants", platforms: ["FACEBOOK", "WHATSAPP"], status: "PUBLISHED", publishedAt: new Date(now - 6 * DAY), results: { FACEBOOK: { ok: false, error: "manual", at: new Date(now - 6 * DAY).toISOString() }, WHATSAPP: { ok: false, error: "manual", at: new Date(now - 6 * DAY).toISOString() } }, campaignId: campaignRows[2]!.id, createdById: staff[4]!.id },
    { content: "🐟 Fish Friday! Live tilapia & catfish straight from our aquaponics ponds. Use code FISHFRIDAY for 15% off.", link: "https://shop.reapwestafrica.org/shop/category/live-fish?utm_source=instagram&utm_medium=social&utm_campaign=radio-fish-friday", platforms: ["FACEBOOK", "INSTAGRAM"], status: "SCHEDULED", scheduledAt: new Date(now + 2 * DAY), campaignId: campaignRows[1]!.id, createdById: staff[4]!.id },
    { content: "🥬 Our family veggie box is back — lettuce, greens, peppers & tomatoes grown without pesticides.", platforms: ["INSTAGRAM", "X"], status: "DRAFT", createdById: staff[4]!.id },
  ]);
  await db.insert(s.broadcasts).values([
    { name: "Weekend pork special", channel: "WHATSAPP", body: "Hi {{firstName}}! This weekend only: fresh pork ribs & chops at REAP. Order now: {{shopUrl}}", audience: { orderedWithinDays: 60 }, status: "SENT", recipientCount: 31, sentCount: 31, startedAt: new Date(now - 12 * DAY), completedAt: new Date(now - 12 * DAY), createdById: staff[4]!.id },
    { name: "Win back — 45 days", channel: "SMS", body: "{{firstName}}, we miss you at REAP Farms! Get 10% off with code WELCOME10: {{shopUrl}}", audience: { notOrderedWithinDays: 45 }, status: "DRAFT", createdById: staff[4]!.id },
  ]);

  // Sample conversation (inbound WhatsApp)
  await db.insert(s.messages).values([
    { customerId: demoCustomer!.id, channel: "WHATSAPP", direction: "INBOUND", status: "RECEIVED", toAddress: "business", fromAddress: "+231775550123", body: "Good morning, do you have finisher pigs for this Saturday? I need 2 for my daughter's wedding.", provider: "meta", sentAt: new Date(now - 3 * 3600_000), createdAt: new Date(now - 3 * 3600_000) },
    { customerId: customerRows[0]!.id, channel: "SMS", direction: "INBOUND", status: "RECEIVED", toAddress: "business", fromAddress: customerRows[0]!.phone, body: "Please send 20 lb ribs and 10 lb chops tomorrow morning to the cook shop.", provider: "twilio", sentAt: new Date(now - 26 * 3600_000), createdAt: new Date(now - 26 * 3600_000) },
  ]);

  console.log(`Seeded ${productRows.length} products/services, ${customerRows.length} customers, ${orderCount} orders.`);
  console.log("Owner login:    owner@reap.farm / " + (process.env.SEED_ADMIN_PASSWORD ? "(SEED_ADMIN_PASSWORD)" : "ReapFarm#2026"));
  console.log("Staff logins:   manager@ / sales@ / accounts@ / marketing@ / farm@ / driver1@reap.farm — ReapStaff#2026");
  console.log("Customer login: customer@reap.farm / Customer#2026");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
