import { percentChange } from "@/lib/utils/money";

export const FORECAST_HORIZONS = [3, 6, 12] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export const MIN_MONTHLY_RATE_PCT = -10;
export const MAX_MONTHLY_RATE_PCT = 15;
export const MAX_BASELINE_CENTS = 100_000_000_000; // $1B guard against absurd input

export type ForecastInput = {
  baselineCents: number;
  monthlyRatePct: number;
  months: number;
};

export type ForecastPoint = {
  month: number;
  projectedCents: number;
  flatCents: number;
  cumulativeProjectedCents: number;
  cumulativeFlatCents: number;
};

export type ForecastResult = {
  points: ForecastPoint[];
  cumulativeProjectedCents: number;
  cumulativeFlatCents: number;
  differenceCents: number;
  /** null when the flat comparison is zero. */
  differencePct: number | null;
  finalMonthCents: number;
};

export type ForecastValidation =
  { ok: true; input: ForecastInput } | { ok: false; errors: string[] };

export function validateForecastInput(input: {
  baselineCents: number | null;
  monthlyRatePct: number | null;
  months: number;
}): ForecastValidation {
  const errors: string[] = [];
  const { baselineCents, monthlyRatePct, months } = input;
  if (baselineCents === null || !Number.isFinite(baselineCents))
    errors.push("Enter a valid monthly baseline.");
  else if (baselineCents < 0) errors.push("Baseline cannot be negative.");
  else if (baselineCents > MAX_BASELINE_CENTS) errors.push("Baseline is too large for a scenario.");
  if (monthlyRatePct === null || !Number.isFinite(monthlyRatePct))
    errors.push("Enter a valid monthly change.");
  else if (monthlyRatePct < MIN_MONTHLY_RATE_PCT || monthlyRatePct > MAX_MONTHLY_RATE_PCT)
    errors.push(
      `Monthly change must be between ${MIN_MONTHLY_RATE_PCT}% and +${MAX_MONTHLY_RATE_PCT}%.`,
    );
  if (!Number.isInteger(months) || months < 1 || months > 36)
    errors.push("Choose a valid forecast horizon.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    input: { baselineCents: baselineCents!, monthlyRatePct: monthlyRatePct!, months },
  };
}

/**
 * projectedExpense(m) = baseline * (1 + rate)^m for m = 1..months.
 * Each month is rounded to whole cents once; cumulative totals sum the rounded months so the
 * chart, the table and the KPIs always agree.
 */
export function computeForecast({
  baselineCents,
  monthlyRatePct,
  months,
}: ForecastInput): ForecastResult {
  const rate = monthlyRatePct / 100;
  const points: ForecastPoint[] = [];
  let cumProjected = 0;
  let cumFlat = 0;
  for (let m = 1; m <= months; m++) {
    const projectedCents = Math.round(baselineCents * Math.pow(1 + rate, m));
    cumProjected += projectedCents;
    cumFlat += baselineCents;
    points.push({
      month: m,
      projectedCents,
      flatCents: baselineCents,
      cumulativeProjectedCents: cumProjected,
      cumulativeFlatCents: cumFlat,
    });
  }
  const differenceCents = cumProjected - cumFlat;
  return {
    points,
    cumulativeProjectedCents: cumProjected,
    cumulativeFlatCents: cumFlat,
    differenceCents,
    differencePct: cumFlat === 0 ? null : percentChange(cumFlat, cumProjected),
    finalMonthCents: points.at(-1)?.projectedCents ?? 0,
  };
}

/** Default baseline: mean of the last three complete months with data; null if fewer than three. */
export function defaultBaselineCents(completeMonthTotals: number[]): number | null {
  if (completeMonthTotals.length < 3) return null;
  const last3 = completeMonthTotals.slice(-3);
  return Math.round(last3.reduce((a, b) => a + b, 0) / 3);
}
