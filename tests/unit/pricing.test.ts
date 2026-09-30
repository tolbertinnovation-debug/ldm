import { describe, expect, it } from "vitest";
import { calculatePricing, optionsKey, quantityProblem, type PricingLine, type PromotionRule } from "@/lib/pricing";

const lines: PricingLine[] = [
  { productId: "chops", categoryId: "pork", unitPrice: 450, quantity: 4, taxable: true }, // 18.00
  { productId: "tilapia", categoryId: "fish", unitPrice: 400, quantity: 2.5, taxable: true }, // 10.00
  { productId: "lettuce", categoryId: "veg", unitPrice: 100, quantity: 2, taxable: false }, // 2.00
];

const promo = (p: Partial<PromotionRule>): PromotionRule => ({
  id: "p1",
  name: "Promo",
  code: "TEST",
  type: "PERCENT",
  value: 10,
  minSubtotal: 0,
  maxDiscount: null,
  scope: "ALL",
  targetIds: [],
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usageCount: 0,
  perCustomerLimit: null,
  firstOrderOnly: false,
  active: true,
  ...p,
});

describe("calculatePricing", () => {
  it("totals lines and delivery", () => {
    const r = calculatePricing({ lines, deliveryFee: 500 });
    expect(r.subtotal).toBe(3000);
    expect(r.deliveryFee).toBe(500);
    expect(r.total).toBe(3500);
  });

  it("applies percentage promotions only to targeted categories", () => {
    const r = calculatePricing({ lines, promotion: promo({ value: 15, scope: "CATEGORIES", targetIds: ["fish"] }) });
    expect(r.discountTotal).toBe(150);
    expect(r.promotionApplied).toBe(true);
    expect(r.total).toBe(2850);
  });

  it("caps percentage discounts at maxDiscount and fixed discounts at the eligible amount", () => {
    expect(calculatePricing({ lines, promotion: promo({ value: 50, maxDiscount: 500 }) }).discountTotal).toBe(500);
    expect(calculatePricing({ lines, promotion: promo({ type: "FIXED", value: 5000, scope: "PRODUCTS", targetIds: ["lettuce"] }) }).discountTotal).toBe(200);
  });

  it("gives free delivery via promotion or zone threshold", () => {
    expect(calculatePricing({ lines, deliveryFee: 700, promotion: promo({ type: "FREE_DELIVERY", value: 0 }) }).deliveryFee).toBe(0);
    expect(calculatePricing({ lines, deliveryFee: 700, freeDeliveryOver: 2500 }).deliveryFee).toBe(0);
    expect(calculatePricing({ lines, deliveryFee: 700, freeDeliveryOver: 5000 }).deliveryFee).toBe(700);
  });

  it("rejects ineligible promotions with a reason", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    expect(calculatePricing({ lines, promotion: promo({ minSubtotal: 5000 }) }).promotionError).toMatch(/minimum/i);
    expect(calculatePricing({ lines, promotion: promo({ endsAt: new Date("2026-08-01") }), context: { now } }).promotionError).toMatch(/expired/);
    expect(calculatePricing({ lines, promotion: promo({ startsAt: new Date("2026-10-01") }), context: { now } }).promotionError).toMatch(/not active yet/);
    expect(calculatePricing({ lines, promotion: promo({ usageLimit: 5, usageCount: 5 }) }).promotionError).toMatch(/fully used/);
    expect(calculatePricing({ lines, promotion: promo({ firstOrderOnly: true }), context: { customerOrderCount: 2 } }).promotionError).toMatch(/first orders/);
    expect(calculatePricing({ lines, promotion: promo({ perCustomerLimit: 1 }), context: { customerRedemptions: 1 } }).promotionError).toMatch(/already used/);
    expect(calculatePricing({ lines, promotion: promo({ active: false }) }).promotionError).toMatch(/not active/);
    const noMatch = calculatePricing({ lines, promotion: promo({ scope: "PRODUCTS", targetIds: ["nothing"] }) });
    expect(noMatch.promotionError).toMatch(/does not apply/);
    expect(noMatch.discountTotal).toBe(0);
  });

  it("stacks a standing customer discount and never discounts below zero", () => {
    const r = calculatePricing({ lines, customerDiscountPercent: 5, promotion: promo({ type: "FIXED", value: 100000 }) });
    expect(r.discounts).toHaveLength(2);
    expect(r.discountTotal).toBe(3000);
    expect(r.total).toBe(0);
  });

  it("taxes only taxable goods after proportional discount", () => {
    const r = calculatePricing({ lines, taxRate: 10, promotion: promo({ value: 10 }) });
    // taxable 2800, discount 300 * 2800/3000 = 280 → base 2520 → tax 252
    expect(r.taxTotal).toBe(252);
    expect(r.total).toBe(3000 - 300 + 252);
  });
});

describe("quantity rules", () => {
  const rules = { minQty: 1, qtyStep: 0.5, maxQty: 50 };
  it("accepts valid steps", () => {
    expect(quantityProblem(2.5, rules)).toBeNull();
    expect(quantityProblem(1, rules)).toBeNull();
  });
  it("rejects invalid quantities", () => {
    expect(quantityProblem(0, rules)).toMatch(/greater than zero/);
    expect(quantityProblem(0.5, rules)).toMatch(/Minimum/);
    expect(quantityProblem(51, rules)).toMatch(/Maximum/);
    expect(quantityProblem(1.25, rules)).toMatch(/steps/);
    expect(quantityProblem(105, { minQty: 100, qtyStep: 10, maxQty: null })).toMatch(/steps/);
    expect(quantityProblem(110, { minQty: 100, qtyStep: 10, maxQty: null })).toBeNull();
  });
  it("builds stable option keys", () => {
    expect(optionsKey([{ group: "B", choice: "x" }, { group: "A", choice: "y" }])).toBe(optionsKey([{ group: "A", choice: "y" }, { group: "B", choice: "x" }]));
  });
});
