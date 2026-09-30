/**
 * REAP platform database schema (PostgreSQL, Drizzle ORM).
 *
 * Conventions
 * - Money is stored as integer minor units (cents) in the store's base currency.
 * - Quantities are numeric(12,3) so meat and fish can be sold by the pound/kilo.
 * - Column names are snake_case in SQL (drizzle `casing: "snake_case"`).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const createdAt = () => timestamp({ withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
const qty = () => numeric({ precision: 12, scale: 3, mode: "number" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SALES",
  "INVENTORY",
  "ACCOUNTANT",
  "MARKETING",
  "DRIVER",
  "SUPPORT",
  "CUSTOMER",
]);

export const productType = pgEnum("product_type", ["PRODUCT", "SERVICE"]);
export const productStatus = pgEnum("product_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);
export const salesUnit = pgEnum("sales_unit", [
  "EACH",
  "HEAD",
  "LB",
  "KG",
  "DOZEN",
  "TRAY",
  "BUNCH",
  "BAG",
  "CRATE",
  "LITER",
  "GALLON",
  "PACK",
  "HUNDRED",
  "PERSON",
  "SESSION",
  "HOUR",
]);
export const availability = pgEnum("availability", ["IN_STOCK", "PREORDER", "MADE_TO_ORDER"]);
export const stockMovementType = pgEnum("stock_movement_type", [
  "RECEIVE",
  "PRODUCTION",
  "SALE",
  "RETURN",
  "ADJUSTMENT",
  "MORTALITY",
  "SPOILAGE",
  "TRANSFER",
]);

export const customerType = pgEnum("customer_type", [
  "INDIVIDUAL",
  "RESTAURANT",
  "HOTEL",
  "RETAILER",
  "WHOLESALER",
  "INSTITUTION",
  "FARMER",
  "NGO",
]);

export const orderStatus = pgEnum("order_status", [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
]);
export const fulfillmentType = pgEnum("fulfillment_type", ["DELIVERY", "PICKUP"]);
export const orderChannel = pgEnum("order_channel", [
  "WEB",
  "PHONE",
  "WHATSAPP",
  "WALK_IN",
  "SOCIAL",
  "WHOLESALE",
  "OTHER",
]);
export const paymentStatus = pgEnum("payment_status", ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED"]);
export const paymentMethod = pgEnum("payment_method", [
  "CASH",
  "ORANGE_MONEY",
  "MTN_MOMO",
  "BANK_TRANSFER",
  "CARD",
  "CHEQUE",
  "OTHER",
]);
export const paymentKind = pgEnum("payment_kind", ["PAYMENT", "REFUND"]);
export const paymentRecordStatus = pgEnum("payment_record_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "UNASSIGNED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
]);
export const invoiceStatus = pgEnum("invoice_status", ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "VOID"]);

export const messageChannel = pgEnum("message_channel", ["SMS", "WHATSAPP", "EMAIL"]);
export const messageDirection = pgEnum("message_direction", ["OUTBOUND", "INBOUND"]);
export const messageStatus = pgEnum("message_status", [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "RECEIVED",
]);
export const broadcastStatus = pgEnum("broadcast_status", [
  "DRAFT",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "CANCELLED",
]);
export const socialPostStatus = pgEnum("social_post_status", [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIAL",
  "FAILED",
]);
export const campaignStatus = pgEnum("campaign_status", ["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"]);
export const campaignChannel = pgEnum("campaign_channel", [
  "FACEBOOK",
  "INSTAGRAM",
  "TIKTOK",
  "GOOGLE",
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "RADIO",
  "TV",
  "PRINT",
  "BILLBOARD",
  "EVENT",
  "REFERRAL",
  "OTHER",
]);
export const promotionType = pgEnum("promotion_type", ["PERCENT", "FIXED", "FREE_DELIVERY"]);
export const promotionScope = pgEnum("promotion_scope", ["ALL", "CATEGORIES", "PRODUCTS"]);
export const bookingStatus = pgEnum("booking_status", ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]);
export const jobStatus = pgEnum("job_status", ["PENDING", "RUNNING", "DONE", "FAILED"]);
export const animalStatus = pgEnum("animal_status", [
  "GROWING",
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "SLAUGHTERED",
  "DECEASED",
]);
export const animalSex = pgEnum("animal_sex", ["MALE", "FEMALE", "MIXED", "UNKNOWN"]);

// ---------------------------------------------------------------------------
// Sequences for human-friendly document numbers
// ---------------------------------------------------------------------------

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 10001 });
export const invoiceNumberSeq = pgSequence("invoice_number_seq", { startWith: 1001 });
export const bookingNumberSeq = pgSequence("booking_number_seq", { startWith: 501 });

// ---------------------------------------------------------------------------
// Identity & access
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text(),
    phone: text(),
    passwordHash: text(),
    role: userRole().notNull().default("CUSTOMER"),
    active: boolean().notNull().default(true),
    totpSecret: text(), // AES-256-GCM encrypted with APP_SECRET
    totpEnabled: boolean().notNull().default(false),
    failedLogins: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("users_phone_uq").on(t.phone).where(sql`${t.phone} is not null`),
    index("users_role_idx").on(t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(), // sha256(token) — the raw token only lives in the cookie
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
    lastSeenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    target: text().notNull(), // normalized phone or email
    purpose: text().notNull(), // LOGIN | RESET
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("verification_codes_target_idx").on(t.target, t.purpose)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull().default(0),
  resetAt: timestamp({ withTimezone: true }).notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    actorName: text(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    summary: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>(),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_entity_idx").on(t.entityType, t.entityId)],
);

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Media (images stored in Postgres so every app instance can serve them)
// ---------------------------------------------------------------------------

export const media = pgTable("media", {
  id: uuid().primaryKey().defaultRandom(),
  filename: text().notNull(),
  contentType: text().notNull(),
  size: integer().notNull(),
  width: integer(),
  height: integer(),
  data: bytea().notNull(),
  thumbData: bytea(),
  alt: text(),
  createdById: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Customers (CRM)
// ---------------------------------------------------------------------------

export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    name: text().notNull(),
    phone: text(),
    email: text(),
    type: customerType().notNull().default("INDIVIDUAL"),
    companyName: text(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    notes: text(),
    source: text(), // how they heard about us
    preferredChannel: messageChannel().default("WHATSAPP"),
    marketingSms: boolean().notNull().default(false),
    marketingWhatsapp: boolean().notNull().default(false),
    marketingEmail: boolean().notNull().default(false),
    discountPercent: integer().notNull().default(0), // standing discount, e.g. wholesale
    unsubscribeToken: text()
      .notNull()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
    ordersCount: integer().notNull().default(0),
    totalSpent: integer().notNull().default(0),
    lastOrderAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_phone_uq").on(t.phone).where(sql`${t.phone} is not null`),
    uniqueIndex("customers_user_uq").on(t.userId).where(sql`${t.userId} is not null`),
    index("customers_email_idx").on(t.email),
    index("customers_created_idx").on(t.createdAt),
  ],
);

export const deliveryZones = pgTable("delivery_zones", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text(),
  fee: integer().notNull().default(0),
  freeOver: integer(), // subtotal above which delivery is free
  estimatedTime: text(), // e.g. "Same day" / "1–2 days"
  sortOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const pickupLocations = pgTable("pickup_locations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  address: text().notNull(),
  hours: text(),
  phone: text(),
  instructions: text(),
  lat: doublePrecision(),
  lng: doublePrecision(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text(),
    recipientName: text(),
    phone: text(),
    line1: text().notNull(),
    area: text(),
    city: text(),
    county: text(),
    landmark: text(),
    zoneId: uuid().references(() => deliveryZones.id, { onDelete: "set null" }),
    lat: doublePrecision(),
    lng: doublePrecision(),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customerId)],
);

// ---------------------------------------------------------------------------
// Catalog & inventory
// ---------------------------------------------------------------------------

export type ProductOptionChoice = { label: string; priceDelta: number };
export type ProductOptionGroup = { name: string; required: boolean; choices: ProductOptionChoice[] };

export const categories = pgTable("categories", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  icon: text(), // key into the icon map in components/category-icon
  imageId: uuid().references(() => media.id, { onDelete: "set null" }),
  sortOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: productType().notNull().default("PRODUCT"),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    name: text().notNull(),
    slug: text().notNull().unique(),
    sku: text(),
    shortDescription: text(),
    description: text(),
    unit: salesUnit().notNull().default("EACH"),
    price: integer().notNull(),
    compareAtPrice: integer(),
    costPrice: integer(),
    pricingNote: text(),
    variableWeight: boolean().notNull().default(false),
    minQty: qty().notNull().default(1),
    qtyStep: qty().notNull().default(1),
    maxQty: qty(),
    trackInventory: boolean().notNull().default(true),
    stockQty: qty().notNull().default(0),
    lowStockThreshold: qty().notNull().default(0),
    allowBackorder: boolean().notNull().default(false),
    availability: availability().notNull().default("IN_STOCK"),
    leadTimeDays: integer().notNull().default(0),
    allowDelivery: boolean().notNull().default(true),
    allowPickup: boolean().notNull().default(true),
    taxable: boolean().notNull().default(true),
    status: productStatus().notNull().default("ACTIVE"),
    featured: boolean().notNull().default(false),
    images: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    options: jsonb().$type<ProductOptionGroup[]>().notNull().default(sql`'[]'::jsonb`),
    attributes: jsonb().$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_sku_uq").on(t.sku).where(sql`${t.sku} is not null`),
    index("products_category_idx").on(t.categoryId),
    index("products_status_idx").on(t.status, t.type),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: stockMovementType().notNull(),
    quantity: qty().notNull(), // signed: + in, − out
    balanceAfter: qty().notNull(),
    unitCost: integer(),
    reference: text(),
    orderId: uuid(),
    animalId: uuid(),
    note: text(),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("stock_movements_product_idx").on(t.productId, t.createdAt)],
);

export const livestock = pgTable(
  "livestock",
  {
    id: uuid().primaryKey().defaultRandom(),
    tag: text().notNull().unique(),
    species: text().notNull().default("PIG"), // PIG | FISH | POULTRY | GOAT | OTHER
    breed: text(),
    sex: animalSex().notNull().default("UNKNOWN"),
    headCount: integer().notNull().default(1), // >1 for fish/poultry batches
    birthDate: date({ mode: "string" }),
    acquiredDate: date({ mode: "string" }),
    source: text(), // BORN_ON_FARM | PURCHASED
    weightKg: numeric({ precision: 10, scale: 2, mode: "number" }),
    location: text(), // pen / pond / tank
    status: animalStatus().notNull().default("GROWING"),
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    orderId: uuid(),
    notes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("livestock_status_idx").on(t.status, t.species)],
);

export const livestockEvents = pgTable(
  "livestock_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    animalId: uuid()
      .notNull()
      .references(() => livestock.id, { onDelete: "cascade" }),
    type: text().notNull(), // WEIGHED | VACCINATED | TREATED | MOVED | STATUS | SLAUGHTERED | NOTE
    weightKg: numeric({ precision: 10, scale: 2, mode: "number" }),
    note: text(),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("livestock_events_animal_idx").on(t.animalId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Marketing: campaigns & promotions
// ---------------------------------------------------------------------------

export const campaigns = pgTable("campaigns", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  channel: campaignChannel().notNull(),
  objective: text(),
  status: campaignStatus().notNull().default("PLANNED"),
  startDate: date({ mode: "string" }),
  endDate: date({ mode: "string" }),
  budget: integer().notNull().default(0),
  utmCampaign: text().notNull().unique(),
  landingPath: text().notNull().default("/"),
  targetAudience: text(),
  notes: text(),
  createdById: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const campaignMetrics = pgTable(
  "campaign_metrics",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    spend: integer().notNull().default(0),
    impressions: integer().notNull().default(0),
    clicks: integer().notNull().default(0),
    leads: integer().notNull().default(0),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("campaign_metrics_day_uq").on(t.campaignId, t.date)],
);

export const promotions = pgTable(
  "promotions",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    code: text(), // null => automatic promotion
    description: text(),
    type: promotionType().notNull(),
    value: integer().notNull().default(0), // percent (0-100) or cents
    minSubtotal: integer().notNull().default(0),
    maxDiscount: integer(),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    usageLimit: integer(),
    perCustomerLimit: integer(),
    usageCount: integer().notNull().default(0),
    firstOrderOnly: boolean().notNull().default(false),
    scope: promotionScope().notNull().default("ALL"),
    targetIds: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("promotions_code_uq").on(t.code).where(sql`${t.code} is not null`)],
);

// ---------------------------------------------------------------------------
// Carts
// ---------------------------------------------------------------------------

export type SelectedOption = { group: string; choice: string; priceDelta: number };

export const carts = pgTable("carts", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().references(() => users.id, { onDelete: "cascade" }),
  promoCode: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: qty().notNull(),
    options: jsonb().$type<SelectedOption[]>().notNull().default(sql`'[]'::jsonb`),
    optionsKey: text().notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("cart_items_line_uq").on(t.cartId, t.productId, t.optionsKey)],
);

// ---------------------------------------------------------------------------
// Orders, fulfilment & delivery
// ---------------------------------------------------------------------------

export type AddressSnapshot = {
  recipientName?: string | null;
  phone?: string | null;
  line1: string;
  area?: string | null;
  city?: string | null;
  county?: string | null;
  landmark?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text().notNull().unique(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: orderStatus().notNull().default("PENDING"),
    fulfillmentType: fulfillmentType().notNull(),
    channel: orderChannel().notNull().default("WEB"),
    contactName: text().notNull(),
    contactPhone: text().notNull(),
    contactEmail: text(),
    deliveryZoneId: uuid().references(() => deliveryZones.id, { onDelete: "set null" }),
    deliveryAddress: jsonb().$type<AddressSnapshot>(),
    pickupLocationId: uuid().references(() => pickupLocations.id, { onDelete: "set null" }),
    scheduledDate: date({ mode: "string" }),
    timeSlot: text(),
    subtotal: integer().notNull().default(0),
    discountTotal: integer().notNull().default(0),
    deliveryFee: integer().notNull().default(0),
    taxTotal: integer().notNull().default(0),
    total: integer().notNull().default(0),
    amountPaid: integer().notNull().default(0),
    paymentStatus: paymentStatus().notNull().default("UNPAID"),
    paymentMethod: paymentMethod(),
    promotionId: uuid().references(() => promotions.id, { onDelete: "set null" }),
    promoCode: text(),
    customerNote: text(),
    internalNote: text(),
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
    trackingToken: text().notNull().unique(),
    placedById: uuid().references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_created_idx").on(t.createdAt),
    index("orders_campaign_idx").on(t.campaignId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    name: text().notNull(),
    sku: text(),
    unit: salesUnit().notNull(),
    variableWeight: boolean().notNull().default(false),
    unitPrice: integer().notNull(), // base price + option deltas
    quantity: qty().notNull(),
    options: jsonb().$type<SelectedOption[]>().notNull().default(sql`'[]'::jsonb`),
    lineTotal: integer().notNull(),
    unitCost: integer(),
    createdAt: createdAt(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text().notNull(), // STATUS | NOTE | PAYMENT | DELIVERY | MESSAGE | EDIT
    status: orderStatus(),
    message: text().notNull(),
    isPublic: boolean().notNull().default(false),
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    driverId: uuid().references(() => users.id, { onDelete: "set null" }),
    status: deliveryStatus().notNull().default("UNASSIGNED"),
    assignedAt: timestamp({ withTimezone: true }),
    pickedUpAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    failedReason: text(),
    recipientName: text(),
    proofNote: text(),
    codCollected: integer().notNull().default(0),
    lat: doublePrecision(),
    lng: doublePrecision(),
    locationUpdatedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("deliveries_driver_idx").on(t.driverId, t.status)],
);

// ---------------------------------------------------------------------------
// Bookkeeping: invoices, payments, expenses
// ---------------------------------------------------------------------------

export const invoices = pgTable(
  "invoices",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text().notNull().unique(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    status: invoiceStatus().notNull().default("DRAFT"),
    issueDate: date({ mode: "string" }).notNull(),
    dueDate: date({ mode: "string" }).notNull(),
    subtotal: integer().notNull().default(0),
    discountTotal: integer().notNull().default(0),
    taxTotal: integer().notNull().default(0),
    total: integer().notNull().default(0),
    amountPaid: integer().notNull().default(0),
    notes: text(),
    terms: text(),
    publicToken: text()
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
    sentAt: timestamp({ withTimezone: true }),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("invoices_customer_idx").on(t.customerId), index("invoices_status_idx").on(t.status, t.dueDate)],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    description: text().notNull(),
    unit: text(),
    quantity: qty().notNull(),
    unitPrice: integer().notNull(),
    lineTotal: integer().notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    reference: text().notNull().unique(),
    kind: paymentKind().notNull().default("PAYMENT"),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    invoiceId: uuid().references(() => invoices.id, { onDelete: "set null" }),
    customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
    method: paymentMethod().notNull(),
    status: paymentRecordStatus().notNull().default("PENDING"),
    amount: integer().notNull(), // always positive; kind tells direction
    currency: text().notNull().default("USD"),
    provider: text().notNull().default("manual"), // manual | mtn_momo | flutterwave
    providerRef: text(),
    payerPhone: text(),
    note: text(),
    receivedById: uuid().references(() => users.id, { onDelete: "set null" }),
    paidAt: timestamp({ withTimezone: true }),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_paid_idx").on(t.status, t.paidAt),
    uniqueIndex("payments_provider_ref_uq").on(t.provider, t.providerRef).where(sql`${t.providerRef} is not null`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid().primaryKey().defaultRandom(),
    date: date({ mode: "string" }).notNull(),
    category: text().notNull(),
    description: text().notNull(),
    vendor: text(),
    amount: integer().notNull(),
    paymentMethod: paymentMethod().notNull().default("CASH"),
    reference: text(),
    receiptId: uuid().references(() => media.id, { onDelete: "set null" }),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("expenses_date_idx").on(t.date), index("expenses_category_idx").on(t.category)],
);

// ---------------------------------------------------------------------------
// Service bookings
// ---------------------------------------------------------------------------

export const bookings = pgTable(
  "bookings",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text().notNull().unique(),
    serviceId: uuid().references(() => products.id, { onDelete: "set null" }),
    serviceName: text().notNull(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    contactName: text().notNull(),
    contactPhone: text().notNull(),
    contactEmail: text(),
    preferredDate: date({ mode: "string" }),
    preferredTime: text(),
    participants: integer().notNull().default(1),
    location: text(),
    details: text(),
    status: bookingStatus().notNull().default("REQUESTED"),
    quotedAmount: integer(),
    scheduledAt: timestamp({ withTimezone: true }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    internalNote: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("bookings_status_idx").on(t.status, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------

export const messageTemplates = pgTable("message_templates", {
  id: uuid().primaryKey().defaultRandom(),
  key: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  subject: text(),
  body: text().notNull(),
  active: boolean().notNull().default(true),
  updatedAt: updatedAt(),
});

export type AudienceFilter = {
  types?: string[];
  tags?: string[];
  orderedWithinDays?: number | null;
  notOrderedWithinDays?: number | null;
  minTotalSpent?: number | null;
  productCategoryId?: string | null;
};

export const broadcasts = pgTable("broadcasts", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  channel: messageChannel().notNull(),
  subject: text(),
  body: text().notNull(),
  audience: jsonb().$type<AudienceFilter>().notNull().default(sql`'{}'::jsonb`),
  status: broadcastStatus().notNull().default("DRAFT"),
  scheduledAt: timestamp({ withTimezone: true }),
  startedAt: timestamp({ withTimezone: true }),
  completedAt: timestamp({ withTimezone: true }),
  recipientCount: integer().notNull().default(0),
  sentCount: integer().notNull().default(0),
  failedCount: integer().notNull().default(0),
  campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
  createdById: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
    channel: messageChannel().notNull(),
    direction: messageDirection().notNull().default("OUTBOUND"),
    status: messageStatus().notNull().default("QUEUED"),
    toAddress: text().notNull(),
    fromAddress: text(),
    subject: text(),
    body: text().notNull(),
    provider: text(),
    providerMessageId: text(),
    error: text(),
    templateKey: text(),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    broadcastId: uuid().references(() => broadcasts.id, { onDelete: "set null" }),
    sentById: uuid().references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp({ withTimezone: true }),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_customer_idx").on(t.customerId, t.createdAt),
    index("messages_broadcast_idx").on(t.broadcastId),
    index("messages_inbox_idx").on(t.direction, t.readAt),
    index("messages_provider_idx").on(t.providerMessageId),
  ],
);

export type SocialResult = { ok: boolean; id?: string; url?: string; error?: string; at: string };

export const socialPosts = pgTable("social_posts", {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull(),
  imageUrl: text(),
  link: text(),
  productId: uuid().references(() => products.id, { onDelete: "set null" }),
  campaignId: uuid().references(() => campaigns.id, { onDelete: "set null" }),
  platforms: text().array().notNull().default(sql`'{}'::text[]`),
  status: socialPostStatus().notNull().default("DRAFT"),
  scheduledAt: timestamp({ withTimezone: true }),
  publishedAt: timestamp({ withTimezone: true }),
  results: jsonb().$type<Record<string, SocialResult>>().notNull().default(sql`'{}'::jsonb`),
  createdById: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Background jobs (transactional outbox)
// ---------------------------------------------------------------------------

export const jobs = pgTable(
  "jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: jobStatus().notNull().default("PENDING"),
    runAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(5),
    lastError: text(),
    lockedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_queue_idx").on(t.status, t.runAt)],
);
