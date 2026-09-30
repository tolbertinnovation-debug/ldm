import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, formatMoneyCompact, lineTotal, parseMoney, percentOf } from "@/lib/money";

describe("money", () => {
  it("formats currencies including Liberian dollars", () => {
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
    expect(formatMoney(-500, "USD")).toBe("−$5.00");
    expect(formatMoney(190000, "LRD", { showZeroDecimals: false })).toBe("L$1,900");
    expect(formatMoneyCompact(150_000, "USD")).toBe("$1.5k");
    expect(formatMoneyCompact(4_200_000, "USD")).toBe("$42k");
  });

  it("parses user input safely", () => {
    expect(parseMoney("1,250.50")).toBe(125050);
    expect(parseMoney("$12")).toBe(1200);
    expect(parseMoney("0.5")).toBe(50);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(centsToInput(1050)).toBe("10.50");
  });

  it("computes exact half-up line totals for weighed items", () => {
    expect(lineTotal(450, 2.35)).toBe(1058); // 10.575 → $10.58
    expect(lineTotal(275, 132.5)).toBe(36438);
    expect(lineTotal(199, 3)).toBe(597);
    expect(lineTotal(1, 0.5)).toBe(1);
  });

  it("computes percentages half-up", () => {
    expect(percentOf(10000, 10)).toBe(1000);
    expect(percentOf(999, 15)).toBe(150);
    expect(percentOf(10000, 7.5)).toBe(750);
  });
});
