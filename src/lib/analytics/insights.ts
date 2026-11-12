import { formatCentsRounded, median } from "@/lib/utils/money";
import type { AnalyticsInvoice } from "@/lib/invoices/types";
import { DUPLICATE_REASON_TEXT, type DuplicateMatch } from "@/lib/invoices/duplicates";
import {
  compare,
  lastCompleteMonths,
  monthTotalsBy,
  type AggregateRow,
  type Comparison,
} from "./aggregate";
import { currentMonthKey, monthLabel } from "./periods";

/**
 * Documented, deliberately simple thresholds. All insight math is deterministic; no model is involved.
 */
export const INSIGHT_THRESHOLDS = {
  /** Minimum relative change to report a category/supplier movement. */
  minChangePct: 10,
  /** Movements below this absolute change (cents) are noise. */
  minChangeCents: 5_000,
  /** Previous-month baseline must be at least this to compute a meaningful percentage. */
  minBaselineCents: 5_000,
  /** Change at or above this relative level is shown as a warning rather than informational. */
  warningChangePct: 25,
  /** Unusual-invoice rule: needs this many prior invoices from the supplier ... */
  minPriorInvoices: 3,
  /** ... compares against the median of up to this many prior invoices ... */
  priorWindow: 5,
  /** ... and flags totals at least this multiple of that median ... */
  largeInvoiceMultiplier: 2,
  /** ... and at least this much above it in absolute terms. */
  largeInvoiceMinExcessCents: 10_000,
  /** Only recent invoices are evaluated for unusual size. */
  recentDays: 60,
} as const;

export type InsightKind =
  | "category_change"
  | "supplier_change"
  | "large_invoice"
  | "duplicate_invoice"
  | "insufficient_history";
export type Severity = "info" | "warning" | "critical";

export type InsightDraft = {
  stable_key: string;
  kind: InsightKind;
  severity: Severity;
  title: string;
  body: string;
  evidence: Record<string, unknown> & { suggestedAction: string };
  related_invoice_ids: string[];
  reporting_period: string | null;
};

/** Invoices pending duplicate investigation (supplied by the caller from invoice records). */
export type DuplicateFlag = {
  invoiceId: string;
  supplier: string | null;
  invoiceNumber: string | null;
  totalCents: number | null;
  currency: string | null;
  matches: DuplicateMatch[];
  /** True for byte-identical documents that were auto-excluded. */
  exact: boolean;
};

const fmtPct = (pct: number) => `${Math.round(Math.abs(pct))}%`;

function movementInsight(
  entity: "category" | "supplier",
  name: string,
  cmp: Comparison,
  latest: string,
  previous: string,
): InsightDraft | null {
  const t = INSIGHT_THRESHOLDS;
  if (cmp.changePct === null || cmp.previousCents < t.minBaselineCents) return null;
  if (Math.abs(cmp.changePct) < t.minChangePct || Math.abs(cmp.changeCents) < t.minChangeCents)
    return null;
  const up = cmp.changeCents > 0;
  const verb = up ? "increased" : "decreased";
  const prevLabel = monthLabel(previous);
  const latestLabel = monthLabel(latest);
  const isCategory = entity === "category";
  const title = isCategory
    ? `${name} expenses ${verb} ${fmtPct(cmp.changePct)}`
    : `Total invoiced spending with ${name} ${verb} ${fmtPct(cmp.changePct)}`;
  const body = isCategory
    ? `Recorded ${name.toLowerCase()} invoices totaled ${formatCentsRounded(cmp.currentCents)} in ${latestLabel} compared with ${formatCentsRounded(cmp.previousCents)} in ${prevLabel}.`
    : `Recorded invoices from ${name} totaled ${formatCentsRounded(cmp.currentCents)} in ${latestLabel} compared with ${formatCentsRounded(cmp.previousCents)} in ${prevLabel}. This reflects total invoiced amounts, not unit prices.`;
  return {
    stable_key: `${isCategory ? "category" : "supplier"}:${name.toLowerCase()}:${latest}`,
    kind: isCategory ? "category_change" : "supplier_change",
    severity: up && cmp.changePct >= t.warningChangePct ? "warning" : "info",
    title,
    body,
    evidence: {
      [entity]: name,
      previousMonth: previous,
      currentMonth: latest,
      previousCents: cmp.previousCents,
      currentCents: cmp.currentCents,
      changeCents: cmp.changeCents,
      changePct: Math.round(cmp.changePct * 10) / 10,
      suggestedAction: isCategory
        ? `Review recent ${name.toLowerCase()} invoices.`
        : `Review recent invoices from ${name}.`,
    },
    related_invoice_ids: [],
    reporting_period: latest,
  };
}

export function categoryAndSupplierInsights(
  rows: AggregateRow[],
  currentMonth: string,
): InsightDraft[] {
  const { latest, previous, enoughHistory } = lastCompleteMonths(rows, currentMonth);
  if (!latest || !previous || !enoughHistory) return [];
  const out: InsightDraft[] = [];
  for (const by of ["category", "supplier"] as const) {
    const cur = monthTotalsBy(rows, latest, by);
    const prev = monthTotalsBy(rows, previous, by);
    const items: { draft: InsightDraft; abs: number }[] = [];
    for (const [key, c] of cur) {
      const p = prev.get(key);
      const draft = movementInsight(
        by,
        c.name,
        compare(p?.totalCents ?? 0, c.totalCents),
        latest,
        previous,
      );
      if (draft) items.push({ draft, abs: Math.abs(draft.evidence.changeCents as number) });
    }
    // Supplier movements can be numerous; keep the five largest to avoid noise.
    items.sort((a, b) => b.abs - a.abs);
    out.push(...items.slice(0, by === "supplier" ? 5 : 8).map((i) => i.draft));
  }
  return out;
}

export function largeInvoiceInsights(
  invoices: AnalyticsInvoice[],
  now: Date,
  timeZone: string,
): InsightDraft[] {
  const t = INSIGHT_THRESHOLDS;
  const cutoff = new Date(now.getTime() - t.recentDays * 86_400_000).toISOString().slice(0, 10);
  const bySupplier = new Map<string, AnalyticsInvoice[]>();
  for (const inv of invoices) {
    const list = bySupplier.get(inv.normalizedSupplier) ?? [];
    list.push(inv);
    bySupplier.set(inv.normalizedSupplier, list);
  }
  const out: InsightDraft[] = [];
  for (const list of bySupplier.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    list.forEach((inv, i) => {
      if (inv.date < cutoff) return;
      const prior = list.slice(Math.max(0, i - t.priorWindow), i);
      if (prior.length < t.minPriorInvoices) return;
      const med = median(prior.map((p) => p.totalCents));
      if (!med || med <= 0) return;
      const excess = inv.totalCents - med;
      if (inv.totalCents < med * t.largeInvoiceMultiplier || excess < t.largeInvoiceMinExcessCents)
        return;
      const times = (inv.totalCents / med).toFixed(1);
      out.push({
        stable_key: `large_invoice:${inv.id}`,
        kind: "large_invoice",
        severity: "warning",
        title: `Invoice from ${inv.supplier} is unusually large`,
        body: `This invoice totals ${formatCentsRounded(inv.totalCents)}, about ${times}× the median (${formatCentsRounded(med)}) of the previous ${prior.length} recorded invoices from this supplier. This may be legitimate, such as a larger order.`,
        evidence: {
          supplier: inv.supplier,
          invoiceTotalCents: inv.totalCents,
          medianPriorCents: med,
          priorInvoiceCount: prior.length,
          multiple: Number(times),
          invoiceDate: inv.date,
          timeZone,
          suggestedAction: "Check the invoice against the purchase order or delivery.",
        },
        related_invoice_ids: [inv.id, ...prior.map((p) => p.id)],
        reporting_period: inv.date.slice(0, 7),
      });
    });
  }
  return out.sort((a, b) => a.stable_key.localeCompare(b.stable_key));
}

export function duplicateInsights(flags: DuplicateFlag[]): InsightDraft[] {
  return flags.map((f) => {
    const related = f.matches.map((m) => m.invoiceId);
    const supplier = f.supplier ?? "an unknown supplier";
    const label = f.invoiceNumber ? `Invoice ${f.invoiceNumber}` : "An invoice";
    return {
      stable_key: `duplicate:${f.invoiceId}`,
      kind: "duplicate_invoice" as const,
      severity: f.exact ? ("info" as const) : ("warning" as const),
      title: f.exact
        ? `Identical document from ${supplier} ignored`
        : `Possible duplicate invoice from ${supplier}`,
      body: f.exact
        ? `${label} is a byte-identical copy of a document already recorded and is excluded from totals.`
        : `${label} resembles an existing record. ${f.matches.map((m) => DUPLICATE_REASON_TEXT[m.reason]).join(" ")} It stays out of expense totals until you decide.`,
      evidence: {
        supplier: f.supplier,
        invoiceNumber: f.invoiceNumber,
        totalCents: f.totalCents,
        reasons: f.matches.map((m) => m.reason),
        suggestedAction: f.exact
          ? "No action needed unless this was a genuinely separate invoice."
          : "Open both invoices and confirm whether this is a duplicate.",
      },
      related_invoice_ids: [f.invoiceId, ...related],
      reporting_period: null,
    };
  });
}

export function insufficientHistoryInsight(
  rows: AggregateRow[],
  currentMonth: string,
): InsightDraft | null {
  const { enoughHistory } = lastCompleteMonths(rows, currentMonth);
  if (enoughHistory) return null;
  return {
    stable_key: "insufficient_history",
    kind: "insufficient_history",
    severity: "info",
    title: "Not enough history for trend insights yet",
    body: "Month-over-month insights need approved invoices in at least two consecutive completed months. Keep forwarding invoices and trends will appear automatically.",
    evidence: { suggestedAction: "Forward recent supplier invoices to your inbox address." },
    related_invoice_ids: [],
    reporting_period: null,
  };
}

export type InsightInputs = {
  rows: AggregateRow[];
  /** Counted invoices (recent history sufficient for the large-invoice rule). */
  invoices: AnalyticsInvoice[];
  duplicateFlags: DuplicateFlag[];
  now: Date;
  timeZone: string;
};

/** Pure entry point: everything the persisted `insights` table should currently contain. */
export function buildInsights({
  rows,
  invoices,
  duplicateFlags,
  now,
  timeZone,
}: InsightInputs): InsightDraft[] {
  const currentMonth = currentMonthKey(now, timeZone);
  const drafts = [
    ...categoryAndSupplierInsights(rows, currentMonth),
    ...largeInvoiceInsights(invoices, now, timeZone),
    ...duplicateInsights(duplicateFlags),
  ];
  const sparse = insufficientHistoryInsight(rows, currentMonth);
  if (sparse) drafts.push(sparse);
  return drafts;
}
