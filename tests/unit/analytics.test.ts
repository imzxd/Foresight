import { describe, expect, it } from "vitest";
import {
  categoryTotals,
  completeMonthTotalsFilled,
  filledMonthlySeries,
  monthlyTotals,
  supplierTotals,
  type AggregateRow,
} from "@/lib/analytics/aggregate";
import { buildInsights, INSIGHT_THRESHOLDS } from "@/lib/analytics/insights";
import { currentMonthKey, shiftMonth } from "@/lib/analytics/periods";
import type { AnalyticsInvoice } from "@/lib/invoices/types";

const NOW = new Date("2026-06-15T12:00:00Z"); // current month 2026-06; latest complete = 2026-05
const row = (
  month: string,
  category: AggregateRow["category"],
  supplier: string,
  totalCents: number,
): AggregateRow => ({
  month,
  category,
  supplier,
  normalizedSupplier: supplier.toLowerCase(),
  totalCents,
  count: 1,
});
const run = (rows: AggregateRow[], invoices: AnalyticsInvoice[] = [], flags = []) =>
  buildInsights({ rows, invoices, duplicateFlags: flags, now: NOW, timeZone: "America/Toronto" });

describe("periods", () => {
  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });
  it("uses the organization timezone for the current month", () => {
    const edge = new Date("2026-07-01T02:00:00Z"); // still June 30 in Toronto
    expect(currentMonthKey(edge, "America/Toronto")).toBe("2026-06");
    expect(currentMonthKey(edge, "UTC")).toBe("2026-07");
  });
  it("falls back to UTC for invalid timezones", () => {
    expect(currentMonthKey(NOW, "Not/AZone")).toBe("2026-06");
  });
});

describe("aggregation", () => {
  const rows = [
    row("2026-03", "Packaging", "Pack Co", 100_000),
    row("2026-05", "Packaging", "Pack Co", 150_000),
    row("2026-05", "Inventory", "Fresh Foods", 300_000),
  ];
  it("groups by month, category and supplier", () => {
    expect(monthlyTotals(rows).map((m) => m.totalCents)).toEqual([100_000, 450_000]);
    expect(categoryTotals(rows)[0]).toMatchObject({ name: "Inventory", totalCents: 300_000 });
    expect(supplierTotals(rows)[0]).toMatchObject({ name: "Fresh Foods" });
  });
  it("zero-fills gaps and excludes the incomplete current month from baselines", () => {
    const withCurrent = [...rows, row("2026-06", "Rent", "Landlord", 999_999)];
    expect(filledMonthlySeries(rows, "2026-05").map((m) => m.totalCents)).toEqual([
      100_000, 0, 450_000,
    ]);
    expect(completeMonthTotalsFilled(withCurrent, "2026-06")).toEqual([100_000, 0, 450_000]);
  });
});

describe("insights", () => {
  it("reports category change with amounts, using complete months only", () => {
    const rows = [
      row("2026-04", "Packaging", "Pack Co", 200_000),
      row("2026-05", "Packaging", "Pack Co", 236_000),
      row("2026-06", "Packaging", "Pack Co", 900_000), // incomplete month must be ignored
    ];
    const cat = run(rows).find((i) => i.kind === "category_change")!;
    expect(cat.title).toBe("Packaging expenses increased 18%");
    expect(cat.evidence).toMatchObject({
      previousCents: 200_000,
      currentCents: 236_000,
      suggestedAction: expect.any(String),
    });
    expect(cat.reporting_period).toBe("2026-05");
    expect(cat.body).toContain("$2,360");
    expect(cat.body).toContain("$2,000");
  });

  it("describes supplier changes as total spending, not prices", () => {
    const rows = [
      row("2026-04", "Inventory", "Fresh Foods", 100_000),
      row("2026-05", "Inventory", "Fresh Foods", 122_000),
    ];
    const s = run(rows).find((i) => i.kind === "supplier_change")!;
    expect(s.title).toBe("Total invoiced spending with Fresh Foods increased 22%");
    expect(s.body).toMatch(/not unit prices/);
  });

  it("ignores small movements and tiny baselines", () => {
    const small = [row("2026-04", "Rent", "L", 100_000), row("2026-05", "Rent", "L", 105_000)];
    expect(run(small).filter((i) => i.kind !== "insufficient_history")).toEqual([]);
    const tiny = [row("2026-04", "Other", "X", 1_000), row("2026-05", "Other", "X", 9_000)];
    expect(run(tiny).filter((i) => i.kind !== "insufficient_history")).toEqual([]);
  });

  it("does not fabricate trends with insufficient history", () => {
    const only = run([row("2026-05", "Rent", "L", 100_000)]);
    expect(only.map((i) => i.kind)).toEqual(["insufficient_history"]);
    expect(run([])[0]?.kind).toBe("insufficient_history");
  });

  it("produces stable, unique keys", () => {
    const rows = [
      row("2026-04", "Packaging", "P", 200_000),
      row("2026-05", "Packaging", "P", 300_000),
    ];
    const keys = run(rows).map((i) => i.stable_key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(run(rows).map((i) => i.stable_key)).toEqual(keys);
  });

  describe("large invoices", () => {
    const inv = (id: string, date: string, totalCents: number): AnalyticsInvoice => ({
      id,
      supplier: "ABC Supplies",
      normalizedSupplier: "abc supplies",
      date,
      category: "Inventory",
      totalCents,
    });
    const history = ["2026-04-01", "2026-04-10", "2026-04-20", "2026-05-01", "2026-05-10"].map(
      (d, i) => inv(`h${i}`, d, 50_000),
    );
    it("flags an invoice far above the prior-five median without calling it fraud", () => {
      const out = run([], [...history, inv("big", "2026-06-10", 140_000)]).find(
        (i) => i.kind === "large_invoice",
      )!;
      expect(out).toBeDefined();
      expect(out.related_invoice_ids[0]).toBe("big");
      expect(out.evidence).toMatchObject({ medianPriorCents: 50_000, priorInvoiceCount: 5 });
      expect(`${out.title} ${out.body}`.toLowerCase()).not.toContain("fraud");
    });
    it("requires adequate history", () => {
      const few = history.slice(0, INSIGHT_THRESHOLDS.minPriorInvoices - 1);
      expect(
        run([], [...few, inv("big", "2026-06-10", 500_000)]).some(
          (i) => i.kind === "large_invoice",
        ),
      ).toBe(false);
    });
    it("does not flag ordinary variation", () => {
      expect(
        run([], [...history, inv("ok", "2026-06-10", 80_000)]).some(
          (i) => i.kind === "large_invoice",
        ),
      ).toBe(false);
    });
  });

  it("creates duplicate cards linking both records", () => {
    const out = run([], [], [
      {
        invoiceId: "b",
        supplier: "ABC Supplies",
        invoiceNumber: "123",
        totalCents: 5000,
        currency: "CAD",
        matches: [{ invoiceId: "a", reason: "same_supplier_and_number" }],
        exact: false,
      },
    ] as never).find((i) => i.kind === "duplicate_invoice")!;
    expect(out.stable_key).toBe("duplicate:b");
    expect(out.related_invoice_ids).toEqual(["b", "a"]);
    expect(out.severity).toBe("warning");
  });
});
