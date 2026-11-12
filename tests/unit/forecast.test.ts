import { describe, expect, it } from "vitest";
import {
  computeForecast,
  defaultBaselineCents,
  validateForecastInput,
  FORECAST_HORIZONS,
} from "@/lib/forecast/calc";

describe("computeForecast", () => {
  it("0% growth equals flat spending", () => {
    const r = computeForecast({ baselineCents: 200_000, monthlyRatePct: 0, months: 6 });
    expect(r.cumulativeProjectedCents).toBe(1_200_000);
    expect(r.differenceCents).toBe(0);
    expect(r.differencePct).toBe(0);
    expect(r.points.every((p) => p.projectedCents === 200_000)).toBe(true);
  });

  it("positive growth compounds from month 1", () => {
    const r = computeForecast({ baselineCents: 100_000, monthlyRatePct: 10, months: 3 });
    expect(r.points.map((p) => p.projectedCents)).toEqual([110_000, 121_000, 133_100]);
    expect(r.cumulativeProjectedCents).toBe(364_100);
    expect(r.cumulativeFlatCents).toBe(300_000);
    expect(r.differenceCents).toBe(64_100);
    expect(r.differencePct).toBeCloseTo(21.3667, 3);
    expect(r.finalMonthCents).toBe(133_100);
  });

  it("negative growth reduces spending", () => {
    const r = computeForecast({ baselineCents: 100_000, monthlyRatePct: -10, months: 3 });
    expect(r.points.map((p) => p.projectedCents)).toEqual([90_000, 81_000, 72_900]);
    expect(r.differenceCents).toBe(243_900 - 300_000);
    expect(r.differenceCents).toBeLessThan(0);
  });

  it.each(FORECAST_HORIZONS)("returns %i points with consistent cumulative totals", (months) => {
    const r = computeForecast({ baselineCents: 123_457, monthlyRatePct: 3.5, months });
    expect(r.points).toHaveLength(months);
    const sum = r.points.reduce((a, p) => a + p.projectedCents, 0);
    expect(r.cumulativeProjectedCents).toBe(sum);
    expect(r.points.at(-1)!.cumulativeProjectedCents).toBe(sum);
    expect(r.cumulativeFlatCents).toBe(123_457 * months);
    expect(r.differenceCents).toBe(sum - 123_457 * months);
  });

  it("zero baseline yields zeros and null percentage", () => {
    const r = computeForecast({ baselineCents: 0, monthlyRatePct: 5, months: 12 });
    expect(r.cumulativeProjectedCents).toBe(0);
    expect(r.differencePct).toBeNull();
  });

  it("handles large values without losing integer precision", () => {
    const r = computeForecast({ baselineCents: 50_000_000_000, monthlyRatePct: 15, months: 12 });
    expect(Number.isSafeInteger(r.cumulativeProjectedCents)).toBe(true);
  });
});

describe("validateForecastInput", () => {
  it("accepts valid input", () => {
    expect(validateForecastInput({ baselineCents: 100, monthlyRatePct: 0, months: 3 }).ok).toBe(
      true,
    );
  });
  it.each([
    [{ baselineCents: null, monthlyRatePct: 0, months: 3 }],
    [{ baselineCents: -1, monthlyRatePct: 0, months: 3 }],
    [{ baselineCents: 100, monthlyRatePct: NaN, months: 3 }],
    [{ baselineCents: 100, monthlyRatePct: -11, months: 3 }],
    [{ baselineCents: 100, monthlyRatePct: 16, months: 3 }],
    [{ baselineCents: 100, monthlyRatePct: 0, months: 0 }],
    [{ baselineCents: Infinity, monthlyRatePct: 0, months: 3 }],
  ])("rejects %j", (input) => {
    expect(validateForecastInput(input).ok).toBe(false);
  });
});

describe("defaultBaselineCents", () => {
  it("is the mean of the last three complete months", () => {
    expect(defaultBaselineCents([1, 100, 200, 300, 400])).toBe(300);
  });
  it("is null with fewer than three months", () => {
    expect(defaultBaselineCents([100, 200])).toBeNull();
  });
});
