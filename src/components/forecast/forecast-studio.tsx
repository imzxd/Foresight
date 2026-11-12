"use client";

import { LineChart as LineChartIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ForecastChart } from "@/components/dashboard/charts-lazy";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/field";
import {
  computeForecast,
  FORECAST_HORIZONS,
  MAX_MONTHLY_RATE_PCT,
  MIN_MONTHLY_RATE_PCT,
  validateForecastInput,
  type ForecastHorizon,
} from "@/lib/forecast/calc";
import { cn } from "@/lib/utils/cn";
import {
  centsToInputValue,
  formatCents,
  formatCentsRounded,
  parseMoneyToCents,
} from "@/lib/utils/money";

type Props = {
  /** Mean of the last three complete months, or null when history is insufficient. */
  defaultBaselineCents: number | null;
  baselineNote: string;
  isDemo: boolean;
};

const signed = (cents: number) => `${cents >= 0 ? "+" : "−"}${formatCentsRounded(Math.abs(cents))}`;

function describe(
  rate: number,
  months: number,
  diffCents: number,
  finalCents: number,
  pct: number | null,
) {
  if (rate === 0)
    return `If monthly invoiced expenses stay flat, the ${months}-month total equals the flat-spending line.`;
  const dir = rate > 0 ? "grow" : "shrink";
  const pctText = pct === null ? "" : ` (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`;
  return `If monthly invoiced expenses ${dir} ${Math.abs(rate)}% each month, month ${months} would reach ${formatCentsRounded(finalCents)} and the ${months}-month total would be ${signed(diffCents)}${pctText} versus flat spending.`;
}

function Panel({ defaultBaselineCents, baselineNote }: Omit<Props, "isDemo">) {
  const [baselineText, setBaselineText] = useState(
    defaultBaselineCents === null ? "" : centsToInputValue(defaultBaselineCents),
  );
  const [rateText, setRateText] = useState("0");
  const [months, setMonths] = useState<ForecastHorizon>(6);

  // Everything below is local arithmetic; no network calls happen when controls change.
  const baselineCents = baselineText.trim() === "" ? null : parseMoneyToCents(baselineText);
  const rate = rateText.trim() === "" ? null : Number(rateText);
  const validation = useMemo(
    () => validateForecastInput({ baselineCents, monthlyRatePct: rate, months }),
    [baselineCents, rate, months],
  );
  const result = useMemo(
    () => (validation.ok ? computeForecast(validation.input) : null),
    [validation],
  );

  const sliderValue =
    rate !== null && Number.isFinite(rate)
      ? Math.min(MAX_MONTHLY_RATE_PCT, Math.max(MIN_MONTHLY_RATE_PCT, rate))
      : 0;

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
        Hypothetical what-if scenario based on invoiced expenses (CAD). It is not a prediction, and
        not a revenue, profit or cash-flow forecast.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="fs-baseline" className="text-sm font-medium">
            Monthly expense baseline (CAD)
          </label>
          <Input
            id="fs-baseline"
            inputMode="decimal"
            value={baselineText}
            onChange={(e) => setBaselineText(e.target.value)}
            placeholder="e.g. 8500.00"
            aria-describedby="fs-baseline-note"
          />
          <p id="fs-baseline-note" className="text-xs text-muted">
            {defaultBaselineCents === null
              ? "Not enough historical data for an automatic baseline. Enter your own scenario baseline."
              : baselineNote}
          </p>
          {defaultBaselineCents !== null && (
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline cursor-pointer"
              onClick={() => setBaselineText(centsToInputValue(defaultBaselineCents))}
            >
              Reset to calculated baseline
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="fs-rate" className="text-sm font-medium">
            Expected monthly expense change (%)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              aria-label="Monthly expense change slider"
              min={MIN_MONTHLY_RATE_PCT}
              max={MAX_MONTHLY_RATE_PCT}
              step={0.5}
              value={sliderValue}
              onChange={(e) => setRateText(e.target.value)}
              className="h-2 flex-1 cursor-pointer accent-accent"
            />
            <Input
              id="fs-rate"
              type="number"
              inputMode="decimal"
              step={0.5}
              className="w-24"
              value={rateText}
              onChange={(e) => setRateText(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">
            Range {MIN_MONTHLY_RATE_PCT}% to +{MAX_MONTHLY_RATE_PCT}% per month. Default 0%.
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Forecast horizon</legend>
        <div
          className="inline-flex rounded-lg border border-line p-0.5"
          role="radiogroup"
          aria-label="Forecast horizon"
        >
          {FORECAST_HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={months === h}
              onClick={() => setMonths(h)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer",
                months === h ? "bg-accent text-white" : "text-muted hover:text-ink",
              )}
            >
              {h} months
            </button>
          ))}
        </div>
      </fieldset>

      {!validation.ok && (
        <ul role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {validation.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {result && validation.ok && (
        <div className="space-y-5" data-testid="forecast-results">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Cumulative projected"
              value={formatCentsRounded(result.cumulativeProjectedCents)}
              testId="kpi-cumulative"
            />
            <Kpi
              label={`Month ${months} projected`}
              value={formatCentsRounded(result.finalMonthCents)}
              testId="kpi-final"
            />
            <Kpi
              label="Vs flat spending"
              value={signed(result.differenceCents)}
              testId="kpi-diff"
            />
            <Kpi
              label="Percent difference"
              value={
                result.differencePct === null
                  ? "n/a"
                  : `${result.differencePct >= 0 ? "+" : "−"}${Math.abs(result.differencePct).toFixed(1)}%`
              }
              testId="kpi-pct"
            />
          </dl>
          <p className="text-sm text-muted" data-testid="forecast-explanation">
            {describe(
              validation.input.monthlyRatePct,
              months,
              result.differenceCents,
              result.finalMonthCents,
              result.differencePct,
            )}
          </p>
          <ForecastChart points={result.points} />
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Monthly figures</summary>
            <table className="num mt-2 w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1">Month</th>
                  <th>Projected</th>
                  <th>Flat</th>
                  <th>Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {result.points.map((p) => (
                  <tr key={p.month} className="border-t border-line">
                    <td className="py-1">{p.month}</td>
                    <td>{formatCents(p.projectedCents)}</td>
                    <td>{formatCents(p.flatCents)}</td>
                    <td>{formatCents(p.cumulativeProjectedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-0.5 text-lg font-semibold" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function ForecastStudio({ defaultBaselineCents, baselineNote, isDemo }: Props) {
  return (
    <Drawer
      title="Forecast Studio"
      description={
        isDemo
          ? "Demo scenario using fictional history."
          : "Explore hypothetical expense scenarios from your approved invoices."
      }
      trigger={
        <Button variant="outline">
          <LineChartIcon className="h-4 w-4" /> Forecast Studio
        </Button>
      }
    >
      <Panel defaultBaselineCents={defaultBaselineCents} baselineNote={baselineNote} />
    </Drawer>
  );
}
