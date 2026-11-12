import { normalizeInvoiceNumber, normalizeSupplierName } from "./normalize";

export type DuplicateCandidate = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_cents: number | null;
};

export type DuplicateMatch = {
  invoiceId: string;
  reason: "same_supplier_and_number" | "same_supplier_date_total";
};

/**
 * Potential (non-exact) duplicates. Exact byte duplicates are caught earlier via SHA-256.
 *  - same normalized supplier + same normalized invoice number, or
 *  - same supplier + same date + same total (supporting details).
 */
export function findPotentialDuplicates(
  target: DuplicateCandidate,
  others: DuplicateCandidate[],
): DuplicateMatch[] {
  const supplier = normalizeSupplierName(target.supplier_name);
  if (!supplier) return [];
  const number = normalizeInvoiceNumber(target.invoice_number);
  const matches: DuplicateMatch[] = [];
  for (const o of others) {
    if (o.id === target.id) continue;
    if (normalizeSupplierName(o.supplier_name) !== supplier) continue;
    if (number && normalizeInvoiceNumber(o.invoice_number) === number) {
      matches.push({ invoiceId: o.id, reason: "same_supplier_and_number" });
    } else if (
      target.invoice_date &&
      target.total_cents !== null &&
      o.invoice_date === target.invoice_date &&
      o.total_cents === target.total_cents
    ) {
      matches.push({ invoiceId: o.id, reason: "same_supplier_date_total" });
    }
  }
  return matches;
}

export const DUPLICATE_REASON_TEXT: Record<DuplicateMatch["reason"], string> = {
  same_supplier_and_number: "Same supplier and invoice number as an existing invoice.",
  same_supplier_date_total: "Same supplier, date and total as an existing invoice.",
};
