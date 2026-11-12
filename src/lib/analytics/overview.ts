import { defaultBaselineCents } from "@/lib/forecast/calc";
import { isSupportedCurrency } from "@/lib/utils/money";
import type { InvoiceRow } from "@/lib/invoices/types";
import {
  categoryTotals,
  compare,
  completeMonthTotalsFilled,
  filledMonthlySeries,
  lastCompleteMonths,
  monthlyTotals,
  supplierTotals,
  type AggregateRow,
  type Comparison,
  type MonthTotal,
  type NamedTotal,
} from "./aggregate";
import { currentMonthKey, monthLabel } from "./periods";

/** Only processed (valid or human-approved) invoices in a supported currency count toward analytics. */
export function isCounted(inv: InvoiceRow): boolean {
  return (
    inv.status === "processed" &&
    isSupportedCurrency(inv.currency) &&
    inv.total_cents !== null &&
    !!inv.invoice_date
  );
}

/** In-memory twin of the SQL `expense_aggregates` function (used for demo data and tests). */
export function aggregateInvoices(invoices: InvoiceRow[]): AggregateRow[] {
  const map = new Map<string, AggregateRow>();
  for (const inv of invoices.filter(isCounted)) {
    const month = inv.invoice_date!.slice(0, 7);
    const category = inv.category ?? "Other";
    const norm = inv.normalized_supplier_name ?? "";
    const key = `${month}|${category}|${norm}`;
    const row = map.get(key) ?? {
      month,
      category,
      supplier: inv.supplier_name ?? "Unknown",
      normalizedSupplier: norm,
      totalCents: 0,
      count: 0,
    };
    row.totalCents += inv.total_cents!;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()];
}

export type Overview = {
  totalCents: number;
  invoiceCount: number;
  /** Latest complete month vs the one before; null when there is not enough history. */
  periodChange: (Comparison & { latestLabel: string; previousLabel: string }) | null;
  monthly: (MonthTotal & { partial: boolean })[];
  categories: NamedTotal[];
  suppliers: NamedTotal[];
  baselineCents: number | null;
  baselineMonths: number;
};

export function buildOverview(rows: AggregateRow[], now: Date, timeZone: string): Overview {
  const current = currentMonthKey(now, timeZone);
  const { latest, previous, enoughHistory } = lastCompleteMonths(rows, current);
  const totals = monthlyTotals(rows);
  const byMonth = new Map(totals.map((t) => [t.month, t.totalCents]));
  const completeSeries = completeMonthTotalsFilled(rows, current);
  return {
    totalCents: totals.reduce((a, t) => a + t.totalCents, 0),
    invoiceCount: totals.reduce((a, t) => a + t.count, 0),
    periodChange:
      latest && previous && enoughHistory
        ? {
            ...compare(byMonth.get(previous) ?? 0, byMonth.get(latest) ?? 0),
            latestLabel: monthLabel(latest),
            previousLabel: monthLabel(previous),
          }
        : null,
    monthly: filledMonthlySeries(rows, current).map((m) => ({
      ...m,
      partial: m.month === current,
    })),
    categories: categoryTotals(rows),
    suppliers: supplierTotals(rows).slice(0, 6),
    baselineCents: defaultBaselineCents(completeSeries),
    baselineMonths: Math.min(3, completeSeries.length),
  };
}
