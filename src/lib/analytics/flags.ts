import type { InvoiceRow } from "@/lib/invoices/types";
import type { DuplicateMatch } from "@/lib/invoices/duplicates";
import type { DuplicateFlag } from "./insights";

export type FlagSource = Pick<
  InvoiceRow,
  | "id"
  | "supplier_name"
  | "invoice_number"
  | "total_cents"
  | "currency"
  | "status"
  | "validation_results"
>;

/**
 * Invoices that warrant a duplicate card: unresolved potential duplicates (needs_review) and
 * auto-excluded identical documents. Owner-confirmed duplicates (status duplicate, no exact-hash
 * marker) have been resolved and produce no alert.
 */
export function toDuplicateFlags(rows: FlagSource[]): DuplicateFlag[] {
  const out: DuplicateFlag[] = [];
  for (const r of rows) {
    const issues = r.validation_results ?? [];
    const matches: DuplicateMatch[] = issues
      .filter((i) => i.code === "POTENTIAL_DUPLICATE" && i.relatedInvoiceId)
      .map((i) => ({
        invoiceId: i.relatedInvoiceId!,
        reason: "same_supplier_and_number" as const,
      }));
    const exactOf = issues.find((i) => i.code === "EXACT_DUPLICATE")?.relatedInvoiceId;
    if (r.status === "needs_review" && matches.length === 0) continue;
    if (r.status === "duplicate" && !exactOf && issues.every((i) => i.code !== "EXACT_DUPLICATE"))
      continue;
    if (r.status !== "needs_review" && r.status !== "duplicate") continue;
    out.push({
      invoiceId: r.id,
      supplier: r.supplier_name,
      invoiceNumber: r.invoice_number,
      totalCents: r.total_cents,
      currency: r.currency,
      matches:
        r.status === "duplicate"
          ? exactOf
            ? [{ invoiceId: exactOf, reason: "same_supplier_and_number" }]
            : []
          : matches,
      exact: r.status === "duplicate",
    });
  }
  return out;
}
