export const CATEGORIES = [
  "Inventory",
  "Packaging",
  "Utilities",
  "Equipment",
  "Rent",
  "Marketing",
  "Professional Services",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const INVOICE_STATUSES = [
  "received",
  "processing",
  "processed",
  "needs_review",
  "duplicate",
  "failed",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type InvoiceSource = "resend" | "manual_upload";

export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  relatedInvoiceId?: string;
};

export type InvoiceRow = {
  id: string;
  organization_id: string;
  source: InvoiceSource;
  original_filename: string;
  storage_path: string;
  sha256: string;
  provider_message_id: string | null;
  provider_attachment_id: string | null;
  status: InvoiceStatus;
  supplier_name: string | null;
  normalized_supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  due_date: string | null;
  category: Category | null;
  currency: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  validation_results: ValidationIssue[];
  extraction_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** Minimal projection used by analytics; only counted (processed, reporting-currency) invoices go in. */
export type AnalyticsInvoice = {
  id: string;
  supplier: string;
  normalizedSupplier: string;
  date: string; // YYYY-MM-DD
  category: Category;
  totalCents: number;
};
