import { describe, expect, it } from "vitest";
import {
  formatCents,
  isSupportedCurrency,
  median,
  parseMoneyToCents,
  percentChange,
} from "@/lib/utils/money";

describe("parseMoneyToCents", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["$1,234.56", 123456],
    ["CAD 99.99", 9999],
    ["(45.10)", -4510],
    ["-3.00", -300],
    [19.99, 1999],
    [0.1 + 0.2, 30],
  ])("parses %s", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1,23", "12.345", "1.2.3", null, undefined, NaN, Infinity])(
    "rejects %s",
    (input) => {
      expect(parseMoneyToCents(input as never)).toBeNull();
    },
  );
});

describe("formatting and helpers", () => {
  it("formats CAD cents", () => {
    expect(formatCents(123456)).toContain("1,234.56");
  });
  it("only supports the reporting currency", () => {
    expect(isSupportedCurrency("cad")).toBe(true);
    expect(isSupportedCurrency("USD")).toBe(false);
    expect(isSupportedCurrency(null)).toBe(false);
  });
  it("percentChange is null for zero baseline", () => {
    expect(percentChange(0, 100)).toBeNull();
    expect(percentChange(200, 236)).toBeCloseTo(18);
    expect(percentChange(200, 100)).toBe(-50);
  });
  it("median handles odd, even and empty", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
  });
});
