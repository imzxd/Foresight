import { isSupportedCurrency, parseMoneyToCents } from "@/lib/utils/money";
import type { ExtractedInvoice } from "./extraction-schema";
import { normalizeSupplierName, parseIsoDate } from "./normalize";
import type { Category, InvoiceStatus, ValidationIssue } from "./types";

export const MAX_REASONABLE_TOTAL_CENTS = 1_000_000_000; // $10M
const TOTAL_TOLERANCE_CENTS = 2;

export type NormalizedInvoiceFields = {
  supplier_name: string | null;
  normalized_supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  category: Category | null;
  currency: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
};

export type ValidationOutcome = {
  fields: NormalizedInvoiceFields;
  issues: ValidationIssue[];
  /** processed when there is no blocking issue; otherwise needs_review. */
  status: Extract<InvoiceStatus, "processed" | "needs_review">;
};

const err = (code: string, message: string): ValidationIssue => ({
  code,
  severity: "error",
  message,
});
const warn = (code: string, message: string): ValidationIssue => ({
  code,
  severity: "warning",
  message,
});
const trimOrNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Deterministic checks applied after extraction AND after human edits.
 * Never invents values: missing data stays null and forces review.
 */
export function validateInvoiceFields(
  raw: ExtractedInvoice,
  now: Date = new Date(),
): ValidationOutcome {
  const issues: ValidationIssue[] = [];

  const supplier = trimOrNull(raw.supplier_name);
  const invoiceNumber = trimOrNull(raw.invoice_number);
  const currency = trimOrNull(raw.currency)?.toUpperCase() ?? null;
  const invoiceDate = parseIsoDate(raw.invoice_date);
  const dueDate = parseIsoDate(raw.due_date);
  const subtotal = parseMoneyToCents(raw.subtotal);
  const tax = parseMoneyToCents(raw.tax);
  const total = parseMoneyToCents(raw.total);

  if (!supplier) issues.push(err("MISSING_SUPPLIER", "Supplier name is missing."));
  if (!invoiceNumber) issues.push(err("MISSING_INVOICE_NUMBER", "Invoice number is missing."));
  if (!raw.invoice_date) issues.push(err("MISSING_INVOICE_DATE", "Invoice date is missing."));
  else if (!invoiceDate)
    issues.push(err("INVALID_INVOICE_DATE", "Invoice date is not a valid date."));
  else {
    const d = new Date(`${invoiceDate}T00:00:00Z`);
    const days = (d.getTime() - now.getTime()) / 86_400_000;
    if (days > 7) issues.push(err("FUTURE_INVOICE_DATE", "Invoice date is in the future."));
    if (d.getUTCFullYear() < 2000)
      issues.push(err("IMPLAUSIBLE_INVOICE_DATE", "Invoice date is before 2000."));
  }
  if (raw.due_date && !dueDate)
    issues.push(warn("INVALID_DUE_DATE", "Due date is not a valid date."));
  if (invoiceDate && dueDate && dueDate < invoiceDate)
    issues.push(warn("DUE_BEFORE_INVOICE", "Due date is earlier than the invoice date."));

  if (raw.total === null) issues.push(err("MISSING_TOTAL", "Total amount is missing."));
  else if (total === null)
    issues.push(err("INVALID_TOTAL", "Total amount is not a valid monetary value."));
  else if (total <= 0)
    issues.push(
      err(
        "NON_POSITIVE_TOTAL",
        "Total must be greater than zero (credit notes need manual review).",
      ),
    );
  else if (total > MAX_REASONABLE_TOTAL_CENTS)
    issues.push(err("UNREASONABLE_TOTAL", "Total is unusually large; please confirm."));

  if (raw.subtotal !== null && subtotal === null)
    issues.push(err("INVALID_SUBTOTAL", "Subtotal is not a valid monetary value."));
  if (raw.tax !== null && tax === null)
    issues.push(err("INVALID_TAX", "Tax is not a valid monetary value."));
  if (tax !== null && tax < 0) issues.push(err("NEGATIVE_TAX", "Tax amount is negative."));

  if (subtotal !== null && tax !== null && total !== null) {
    if (Math.abs(subtotal + tax - total) > TOTAL_TOLERANCE_CENTS)
      issues.push(err("TOTAL_MISMATCH", "Subtotal plus tax does not equal the total."));
  } else if (total !== null && subtotal !== null && subtotal > total + TOTAL_TOLERANCE_CENTS) {
    issues.push(err("SUBTOTAL_EXCEEDS_TOTAL", "Subtotal is larger than the total."));
  } else if (subtotal === null || tax === null) {
    issues.push(
      warn("PARTIAL_AMOUNTS", "Subtotal or tax could not be read; only the total is recorded."),
    );
  }

  if (!currency) issues.push(err("MISSING_CURRENCY", "Currency is missing."));
  else if (!isSupportedCurrency(currency))
    issues.push(
      err(
        "UNSUPPORTED_CURRENCY",
        `Currency ${currency} is not supported for reporting; amounts are never converted.`,
      ),
    );

  if (!raw.category)
    issues.push(err("MISSING_CATEGORY", "Expense category could not be determined."));

  const status = issues.some((i) => i.severity === "error") ? "needs_review" : "processed";
  return {
    fields: {
      supplier_name: supplier,
      normalized_supplier_name: supplier ? normalizeSupplierName(supplier) : null,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      category: raw.category,
      currency,
      subtotal_cents: subtotal,
      tax_cents: tax,
      total_cents: total,
    },
    issues,
    status,
  };
}
