import { describe, expect, it } from "vitest";
import { allowedTransitions, canTransition, currentStepIndex, paymentStatusFor, trackingSteps } from "@/lib/order-status";
import { firstName, renderTemplate, smsSegments } from "@/lib/messaging/templates";
import { formatQuantity } from "@/lib/constants";
import { landmarkText } from "@/lib/format";
import { slugify } from "@/lib/slug";

describe("order lifecycle", () => {
  it("allows the normal flow and blocks going backwards", () => {
    expect(canTransition("PENDING", "CONFIRMED", "DELIVERY")).toBe(true);
    expect(canTransition("CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERY")).toBe(true);
    expect(canTransition("COMPLETED", "PENDING", "DELIVERY")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED", "PICKUP")).toBe(false);
  });
  it("never offers out-for-delivery on pickup orders", () => {
    expect(allowedTransitions("READY", "PICKUP")).not.toContain("OUT_FOR_DELIVERY");
    expect(trackingSteps("PICKUP").map((s) => s.status)).toContain("READY");
    expect(currentStepIndex("CANCELLED")).toBe(-1);
  });
  it("derives payment status", () => {
    expect(paymentStatusFor(1000, 0)).toBe("UNPAID");
    expect(paymentStatusFor(1000, 400)).toBe("PARTIALLY_PAID");
    expect(paymentStatusFor(1000, 1000)).toBe("PAID");
    expect(paymentStatusFor(0, 0)).toBe("PAID");
  });
});

describe("messaging helpers", () => {
  it("renders templates and blanks unknown fields", () => {
    expect(renderTemplate("Hi {{firstName}}, order {{ orderNumber }} {{missing}}!", { firstName: "Musu", orderNumber: "REAP-1" })).toBe("Hi Musu, order REAP-1 !");
    expect(firstName("  Comfort  Doe ")).toBe("Comfort");
    expect(firstName(null)).toBe("there");
  });
  it("counts SMS segments", () => {
    expect(smsSegments("a".repeat(160)).segments).toBe(1);
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("🐖 pork").encoding).toBe("Unicode");
  });
});

describe("formatting", () => {
  it("formats quantities with units", () => {
    expect(formatQuantity(1, "HEAD")).toBe("1 head");
    expect(formatQuantity(2.5, "LB")).toBe("2.5 lb");
    expect(formatQuantity(3, "BUNCH")).toBe("3 bunches");
  });
  it("formats landmarks and slugs", () => {
    expect(landmarkText("near the police depot")).toBe("Near the police depot");
    expect(landmarkText("Total station")).toBe("Near Total station");
    expect(slugify("Weaner Piglet (6–8 weeks)")).toBe("weaner-piglet-6-8-weeks");
  });
});
