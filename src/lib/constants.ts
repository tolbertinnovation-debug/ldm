/**
 * Shared enum values, labels and UI tones. Safe to import from client code.
 */

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "accent";

export const SALES_UNITS = [
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
] as const;
export type SalesUnit = (typeof SALES_UNITS)[number];

export const UNIT_LABELS: Record<SalesUnit, { short: string; singular: string; plural: string }> = {
  EACH: { short: "ea", singular: "item", plural: "items" },
  HEAD: { short: "head", singular: "head", plural: "head" },
  LB: { short: "lb", singular: "lb", plural: "lb" },
  KG: { short: "kg", singular: "kg", plural: "kg" },
  DOZEN: { short: "doz", singular: "dozen", plural: "dozen" },
  TRAY: { short: "tray", singular: "tray", plural: "trays" },
  BUNCH: { short: "bunch", singular: "bunch", plural: "bunches" },
  BAG: { short: "bag", singular: "bag", plural: "bags" },
  CRATE: { short: "crate", singular: "crate", plural: "crates" },
  LITER: { short: "L", singular: "liter", plural: "liters" },
  GALLON: { short: "gal", singular: "gallon", plural: "gallons" },
  PACK: { short: "pack", singular: "pack", plural: "packs" },
  HUNDRED: { short: "×100", singular: "hundred", plural: "hundred" },
  PERSON: { short: "person", singular: "person", plural: "people" },
  SESSION: { short: "session", singular: "session", plural: "sessions" },
  HOUR: { short: "hr", singular: "hour", plural: "hours" },
};

export function unitLabel(unit: string, quantity = 1) {
  const u = UNIT_LABELS[unit as SalesUnit];
  if (!u) return unit.toLowerCase();
  return quantity === 1 ? u.singular : u.plural;
}

export function formatQuantity(quantity: number, unit: string) {
  const q = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/\.?0+$/, "");
  return `${q} ${unitLabel(unit, quantity)}`;
}

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: Tone; customer: string }> = {
  PENDING: { label: "Pending", tone: "warning", customer: "Order received — awaiting confirmation" },
  CONFIRMED: { label: "Confirmed", tone: "info", customer: "Order confirmed" },
  PROCESSING: { label: "Processing", tone: "info", customer: "Being prepared" },
  READY: { label: "Ready", tone: "accent", customer: "Ready" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "brand", customer: "Out for delivery" },
  COMPLETED: { label: "Completed", tone: "success", customer: "Completed" },
  CANCELLED: { label: "Cancelled", tone: "danger", customer: "Cancelled" },
};

export const FULFILLMENT_LABELS = { DELIVERY: "Delivery", PICKUP: "Pickup" } as const;

export const ORDER_CHANNELS = ["WEB", "PHONE", "WHATSAPP", "WALK_IN", "SOCIAL", "WHOLESALE", "OTHER"] as const;
export const ORDER_CHANNEL_LABELS: Record<(typeof ORDER_CHANNELS)[number], string> = {
  WEB: "Website",
  PHONE: "Phone call",
  WHATSAPP: "WhatsApp",
  WALK_IN: "Walk-in",
  SOCIAL: "Social media",
  WHOLESALE: "Wholesale",
  OTHER: "Other",
};

export const PAYMENT_STATUS_META = {
  UNPAID: { label: "Unpaid", tone: "danger" },
  PARTIALLY_PAID: { label: "Part paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const PAYMENT_METHODS = [
  "CASH",
  "ORANGE_MONEY",
  "MTN_MOMO",
  "BANK_TRANSFER",
  "CARD",
  "CHEQUE",
  "OTHER",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN Mobile Money",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export const PAYMENT_RECORD_STATUS_META = {
  PENDING: { label: "Pending", tone: "warning" },
  SUCCEEDED: { label: "Succeeded", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const DELIVERY_STATUS_META = {
  UNASSIGNED: { label: "Unassigned", tone: "warning" },
  ASSIGNED: { label: "Assigned", tone: "info" },
  PICKED_UP: { label: "Picked up", tone: "accent" },
  IN_TRANSIT: { label: "In transit", tone: "brand" },
  DELIVERED: { label: "Delivered", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const INVOICE_STATUS_META = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  PARTIALLY_PAID: { label: "Part paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  VOID: { label: "Void", tone: "neutral" },
  OVERDUE: { label: "Overdue", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const CUSTOMER_TYPES = [
  "INDIVIDUAL",
  "RESTAURANT",
  "HOTEL",
  "RETAILER",
  "WHOLESALER",
  "INSTITUTION",
  "FARMER",
  "NGO",
] as const;
export const CUSTOMER_TYPE_LABELS: Record<(typeof CUSTOMER_TYPES)[number], string> = {
  INDIVIDUAL: "Individual",
  RESTAURANT: "Restaurant / cook shop",
  HOTEL: "Hotel",
  RETAILER: "Retailer / market seller",
  WHOLESALER: "Wholesaler",
  INSTITUTION: "School / institution",
  FARMER: "Farmer",
  NGO: "NGO / partner",
};

export const MESSAGE_CHANNELS = ["WHATSAPP", "SMS", "EMAIL"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
};

export const MESSAGE_STATUS_META = {
  QUEUED: { label: "Queued", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "success" },
  READ: { label: "Read", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  RECEIVED: { label: "Received", tone: "brand" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const CAMPAIGN_CHANNELS = [
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
] as const;
export const CAMPAIGN_CHANNEL_LABELS: Record<(typeof CAMPAIGN_CHANNELS)[number], string> = {
  FACEBOOK: "Facebook Ads",
  INSTAGRAM: "Instagram Ads",
  TIKTOK: "TikTok",
  GOOGLE: "Google Ads",
  WHATSAPP: "WhatsApp",
  SMS: "SMS blast",
  EMAIL: "Email",
  RADIO: "Radio",
  TV: "TV",
  PRINT: "Flyers / print",
  BILLBOARD: "Billboard / banner",
  EVENT: "Event / market day",
  REFERRAL: "Referral",
  OTHER: "Other",
};

export const CAMPAIGN_STATUS_META = {
  PLANNED: { label: "Planned", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "info" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const SOCIAL_PLATFORMS = ["FACEBOOK", "INSTAGRAM", "X", "WHATSAPP"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  FACEBOOK: "Facebook Page",
  INSTAGRAM: "Instagram",
  X: "X (Twitter)",
  WHATSAPP: "WhatsApp Status / groups",
};

export const SOCIAL_STATUS_META = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  PUBLISHING: { label: "Publishing", tone: "accent" },
  PUBLISHED: { label: "Published", tone: "success" },
  PARTIAL: { label: "Partly published", tone: "warning" },
  FAILED: { label: "Failed", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const BROADCAST_STATUS_META = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  SENDING: { label: "Sending", tone: "accent" },
  SENT: { label: "Sent", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const BOOKING_STATUS_META = {
  REQUESTED: { label: "Requested", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const ANIMAL_STATUS_META = {
  GROWING: { label: "Growing", tone: "info" },
  AVAILABLE: { label: "For sale", tone: "success" },
  RESERVED: { label: "Reserved", tone: "accent" },
  SOLD: { label: "Sold", tone: "neutral" },
  SLAUGHTERED: { label: "Slaughtered", tone: "neutral" },
  DECEASED: { label: "Deceased", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const SPECIES = ["PIG", "FISH", "POULTRY", "GOAT", "OTHER"] as const;
export const SPECIES_LABELS: Record<(typeof SPECIES)[number], string> = {
  PIG: "Pig",
  FISH: "Fish batch",
  POULTRY: "Poultry flock",
  GOAT: "Goat",
  OTHER: "Other",
};

export const STOCK_MOVEMENT_LABELS = {
  RECEIVE: "Received",
  PRODUCTION: "Produced / harvested",
  SALE: "Sold",
  RETURN: "Returned",
  ADJUSTMENT: "Adjustment",
  MORTALITY: "Mortality",
  SPOILAGE: "Spoilage",
  TRANSFER: "Transfer",
} as const;

export const EXPENSE_CATEGORIES = [
  "Animal feed",
  "Fish feed",
  "Veterinary & medicine",
  "Breeding stock",
  "Fingerlings & seedlings",
  "Labour & wages",
  "Fuel & transport",
  "Electricity & generator",
  "Water",
  "Equipment & repairs",
  "Packaging",
  "Slaughter & processing",
  "Marketing & advertising",
  "Communication & data",
  "Rent & land",
  "Training & workshops",
  "Bank & mobile money fees",
  "Taxes & licences",
  "Office & supplies",
  "Other",
] as const;

export const TIME_SLOTS_DEFAULT = ["Morning (8am – 12pm)", "Afternoon (12pm – 4pm)", "Evening (4pm – 7pm)"];

export const PROMOTION_TYPE_LABELS = {
  PERCENT: "Percentage off",
  FIXED: "Fixed amount off",
  FREE_DELIVERY: "Free delivery",
} as const;
