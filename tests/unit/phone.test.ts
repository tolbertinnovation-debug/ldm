import { describe, expect, it } from "vitest";
import { formatPhone, liberianNetwork, normalizePhone, whatsappLink } from "@/lib/phone";

describe("phone numbers", () => {
  it("normalizes Liberian local formats to E.164", () => {
    expect(normalizePhone("077 012 3456")).toBe("+231770123456");
    expect(normalizePhone("0880123456")).toBe("+231880123456");
    expect(normalizePhone("231 77 012 3456")).toBe("+231770123456");
    expect(normalizePhone("+231-77-012-3456")).toBe("+231770123456");
    expect(normalizePhone("00231770123456")).toBe("+231770123456");
  });
  it("keeps international numbers", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe("+14155550100");
  });
  it("rejects garbage", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  it("formats and identifies networks", () => {
    expect(formatPhone("+231770123456")).toBe("+231 77 012 3456");
    expect(liberianNetwork("+231770123456")).toBe("ORANGE");
    expect(liberianNetwork("+231880123456")).toBe("LONESTAR_MTN");
    expect(whatsappLink("+231770123456", "hi there")).toBe("https://wa.me/231770123456?text=hi%20there");
  });
});
