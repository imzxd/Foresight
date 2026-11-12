import { percentChange } from "@/lib/utils/money";
import type { Category } from "@/lib/invoices/types";
import { monthRange, shiftMonth } from "./periods";

/** One grouped row from the `expense_aggregates` SQL function (counted invoices only). */
export type AggregateRow = {
  month: string; // YYYY-MM
  category: Category;
  supplier: string;
  normalizedSupplier: string;
  totalCents: number;
  count: number;
};

export type MonthTotal = { month: string; totalCents: number; count: number };
export type NamedTotal = { name: string; totalCents: number; count: number };

export type Comparison = {
  previousCents: number;
  currentCents: number;
  changeCents: number;
  /** null when previous is zero. */
  changePct: number | null;
};

export function compare(previousCents: number, currentCents: number): Comparison {
  return {
    previousCents,
    currentCents,
    changeCents: currentCents - previousCents,
    changePct: percentChange(previousCents, currentCents),
  };
}

export function monthlyTotals(rows: AggregateRow[]): MonthTotal[] {
  const map = new Map<string, MonthTotal>();
  for (const r of rows) {
    const t = map.get(r.month) ?? { month: r.month, totalCents: 0, count: 0 };
    t.totalCents += r.totalCents;
    t.count += r.count;
    map.set(r.month, t);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Zero-filled monthly series from first data month through `lastMonth` (inclusive). */
export function filledMonthlySeries(rows: AggregateRow[], lastMonth: string): MonthTotal[] {
  const totals = monthlyTotals(rows);
  if (totals.length === 0) return [];
  const byMonth = new Map(totals.map((t) => [t.month, t]));
  return monthRange(totals[0]!.month, lastMonth).map(
    (m) => byMonth.get(m) ?? { month: m, totalCents: 0, count: 0 },
  );
}

function groupBy(
  rows: AggregateRow[],
  key: (r: AggregateRow) => string,
  name: (r: AggregateRow) => string,
) {
  const map = new Map<string, NamedTotal>();
  for (const r of rows) {
    const k = key(r);
    const t = map.get(k) ?? { name: name(r), totalCents: 0, count: 0 };
    t.totalCents += r.totalCents;
    t.count += r.count;
    map.set(k, t);
  }
  return map;
}

export function categoryTotals(rows: AggregateRow[]): NamedTotal[] {
  return [
    ...groupBy(
      rows,
      (r) => r.category,
      (r) => r.category,
    ).values(),
  ].sort((a, b) => b.totalCents - a.totalCents);
}

export function supplierTotals(rows: AggregateRow[]): NamedTotal[] {
  return [
    ...groupBy(
      rows,
      (r) => r.normalizedSupplier,
      (r) => r.supplier,
    ).values(),
  ].sort((a, b) => b.totalCents - a.totalCents);
}

/** Totals for one month keyed by category / supplier (key = category or normalized supplier). */
export function monthTotalsBy(rows: AggregateRow[], month: string, by: "category" | "supplier") {
  const inMonth = rows.filter((r) => r.month === month);
  return by === "category"
    ? groupBy(
        inMonth,
        (r) => r.category,
        (r) => r.category,
      )
    : groupBy(
        inMonth,
        (r) => r.normalizedSupplier,
        (r) => r.supplier,
      );
}

/** The latest two complete months relative to `currentMonth`, if data exists for both. */
export function lastCompleteMonths(rows: AggregateRow[], currentMonth: string) {
  const totals = monthlyTotals(rows).filter((t) => t.month < currentMonth);
  const latest = totals.at(-1)?.month ?? null;
  if (!latest) return { latest: null, previous: null, enoughHistory: false };
  const previous = shiftMonth(latest, -1);
  const hasPrev = totals.some((t) => t.month === previous);
  return { latest, previous, enoughHistory: hasPrev };
}

/** Complete-month totals, zero-filled, for baseline calculations. */
export function completeMonthTotalsFilled(rows: AggregateRow[], currentMonth: string): number[] {
  const lastComplete = shiftMonth(currentMonth, -1);
  return filledMonthlySeries(
    rows.filter((r) => r.month <= lastComplete),
    lastComplete,
  ).map((t) => t.totalCents);
}
