/**
 * Pure pricing engine used by the cart, checkout, POS and tests.
 * No database access — callers load products/promotions and pass them in.
 */
import { lineTotal, percentOf } from "./money";

export type PricingLine = {
  productId: string;
  categoryId: string | null;
  unitPrice: number; // cents, base price + selected option deltas
  quantity: number;
  taxable: boolean;
};

export type PromotionRule = {
  id: string;
  name: string;
  code: string | null;
  type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  scope: "ALL" | "CATEGORIES" | "PRODUCTS";
  targetIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  active: boolean;
};

export type PricingInput = {
  lines: PricingLine[];
  promotion?: PromotionRule | null;
  deliveryFee?: number;
  freeDeliveryOver?: number | null;
  taxRate?: number; // percent
  customerDiscountPercent?: number;
  context?: {
    now?: Date;
    customerOrderCount?: number; // completed or open orders before this one
    customerRedemptions?: number; // times this customer used the promotion
  };
};

export type DiscountLine = { label: string; amount: number };

export type PricingResult = {
  lineTotals: number[];
  subtotal: number;
  discounts: DiscountLine[];
  discountTotal: number;
  deliveryFee: number;
  freeDelivery: boolean;
  taxTotal: number;
  total: number;
  promotionApplied: boolean;
  promotionError: string | null;
};

/** Returns null when the promotion can be used, otherwise a customer-facing reason. */
export function promotionIneligibility(
  promo: PromotionRule,
  subtotal: number,
  context: PricingInput["context"] = {},
): string | null {
  const now = context.now ?? new Date();
  if (!promo.active) return "This promo code is not active.";
  if (promo.startsAt && now < promo.startsAt) return "This promo code is not active yet.";
  if (promo.endsAt && now > promo.endsAt) return "This promo code has expired.";
  if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) return "This promo code has been fully used.";
  if (promo.firstOrderOnly && (context.customerOrderCount ?? 0) > 0) return "This promo code is for first orders only.";
  if (promo.perCustomerLimit !== null && (context.customerRedemptions ?? 0) >= promo.perCustomerLimit)
    return "You have already used this promo code.";
  if (subtotal < promo.minSubtotal) return `Add more items to use this code (minimum order not reached).`;
  return null;
}

function lineMatches(promo: PromotionRule, line: PricingLine) {
  if (promo.scope === "ALL") return true;
  if (promo.scope === "PRODUCTS") return promo.targetIds.includes(line.productId);
  return line.categoryId !== null && promo.targetIds.includes(line.categoryId);
}

export function calculatePricing(input: PricingInput): PricingResult {
  const lineTotals = input.lines.map((l) => lineTotal(l.unitPrice, l.quantity));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const discounts: DiscountLine[] = [];

  // 1. Standing customer discount (e.g. wholesale / restaurant accounts)
  const customerPct = input.customerDiscountPercent ?? 0;
  if (customerPct > 0 && subtotal > 0) {
    discounts.push({ label: `Account discount (${customerPct}%)`, amount: percentOf(subtotal, customerPct) });
  }

  // 2. Promotion
  let promotionApplied = false;
  let promotionError: string | null = null;
  let freeDelivery = false;
  const promo = input.promotion ?? null;
  if (promo) {
    promotionError = promotionIneligibility(promo, subtotal, input.context);
    if (!promotionError) {
      const eligible = input.lines.reduce((sum, line, i) => (lineMatches(promo, line) ? sum + lineTotals[i] : sum), 0);
      if (promo.type === "FREE_DELIVERY") {
        freeDelivery = true;
        promotionApplied = true;
      } else if (eligible <= 0) {
        promotionError = "This promo code does not apply to the items in your cart.";
      } else {
        let amount = promo.type === "PERCENT" ? percentOf(eligible, Math.min(100, promo.value)) : Math.min(promo.value, eligible);
        if (promo.maxDiscount !== null) amount = Math.min(amount, promo.maxDiscount);
        if (amount > 0) {
          discounts.push({ label: promo.code ? `Promo ${promo.code}` : promo.name, amount });
          promotionApplied = true;
        }
      }
    }
  }

  const discountTotal = Math.min(
    subtotal,
    discounts.reduce((a, d) => a + d.amount, 0),
  );

  // 3. Delivery
  let deliveryFee = Math.max(0, input.deliveryFee ?? 0);
  if (input.freeDeliveryOver !== null && input.freeDeliveryOver !== undefined && subtotal >= input.freeDeliveryOver) {
    freeDelivery = true;
  }
  if (freeDelivery) deliveryFee = 0;

  // 4. Tax on taxable goods, after allocating discounts proportionally
  const taxRate = input.taxRate ?? 0;
  let taxTotal = 0;
  if (taxRate > 0 && subtotal > 0) {
    const taxableSubtotal = input.lines.reduce((sum, line, i) => (line.taxable ? sum + lineTotals[i] : sum), 0);
    const taxableDiscount = Math.round((discountTotal * taxableSubtotal) / subtotal);
    taxTotal = percentOf(Math.max(0, taxableSubtotal - taxableDiscount), taxRate);
  }

  const total = subtotal - discountTotal + deliveryFee + taxTotal;
  return {
    lineTotals,
    subtotal,
    discounts,
    discountTotal,
    deliveryFee,
    freeDelivery,
    taxTotal,
    total,
    promotionApplied,
    promotionError,
  };
}

/** Validates a requested quantity against a product's min/step/max rules. */
export function quantityProblem(
  quantity: number,
  rules: { minQty: number; qtyStep: number; maxQty: number | null },
): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return "Enter a quantity greater than zero.";
  if (quantity < rules.minQty) return `Minimum order is ${rules.minQty}.`;
  if (rules.maxQty !== null && quantity > rules.maxQty) return `Maximum order is ${rules.maxQty}.`;
  const step = Math.round(rules.qtyStep * 1000);
  const q = Math.round(quantity * 1000);
  const min = Math.round(rules.minQty * 1000);
  if (step > 0 && (q - min) % step !== 0 && q % step !== 0) return `Quantity must be in steps of ${rules.qtyStep}.`;
  return null;
}

/** Stable key for a set of selected options, used to merge identical cart lines. */
export function optionsKey(options: { group: string; choice: string }[]) {
  return options
    .map((o) => `${o.group}=${o.choice}`)
    .sort()
    .join("|");
}
