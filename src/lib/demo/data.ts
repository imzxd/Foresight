import { normalizeSupplierName } from "@/lib/invoices/normalize";
import type { Category, InvoiceRow, ValidationIssue } from "@/lib/invoices/types";
import { currentMonthKey, shiftMonth } from "@/lib/analytics/periods";

/** Fictional demonstration organization. None of these businesses or figures are real. */
export const DEMO_ORG = {
  id: "demo-org",
  name: "Demo Bistro (fictional)",
  timezone: "America/Toronto",
  inboxAlias: "inv-demo0000demo",
};

type Seed = {
  supplier: string;
  category: Category;
  day: number;
  offset: number;
  cents: number;
  number: string;
};

/** offset: months before the current month (1 = latest complete month, 0 = month in progress). */
const SEEDS: Seed[] = [];
const add = (
  supplier: string,
  category: Category,
  offset: number,
  day: number,
  cents: number,
  n: string,
) => SEEDS.push({ supplier, category, offset, day, cents, number: n });

const packaging = [180_000, 195_000, 188_000, 192_000, 200_000, 198_000, 200_000, 236_000]; // offsets 8..1
const produce = [310_000, 325_000, 318_000, 340_000, 332_000, 350_000, 345_000, 421_000];
for (let i = 0; i < 8; i++) {
  const offset = 8 - i;
  add("BoxWorks Packaging", "Packaging", offset, 6, packaging[i]! / 2, `BW-${1000 + i * 2}`);
  add("BoxWorks Packaging", "Packaging", offset, 19, packaging[i]! / 2, `BW-${1001 + i * 2}`);
  add(
    "Northwind Produce",
    "Inventory",
    offset,
    4,
    Math.round(produce[i]! * 0.6),
    `NP-${200 + i * 2}`,
  );
  add(
    "Northwind Produce",
    "Inventory",
    offset,
    18,
    Math.round(produce[i]! * 0.4),
    `NP-${201 + i * 2}`,
  );
  add("Greenfield Dairy", "Inventory", offset, 11, 88_000 + ((i * 7_300) % 9_000), `GD-${50 + i}`);
  add("Maple Street Properties", "Rent", offset, 1, 320_000, `RENT-${i + 1}`);
  add(
    "Lakeside Utilities",
    "Utilities",
    offset,
    14,
    41_000 + ((i * 3_100) % 7_000),
    `LU-${700 + i}`,
  );
  if (i % 2 === 0) add("Brightside Marketing", "Marketing", offset, 9, 60_000, `BM-${30 + i}`);
  if (i % 3 === 0) add("Clarke & Lee LLP", "Professional Services", offset, 21, 45_000, `CL-${i}`);
}
add("Harbor Equipment Rentals", "Equipment", 3, 16, 129_900, "HE-77");
// An unusually large invoice relative to Greenfield Dairy's history (a legitimate bulk order, perhaps).
add("Greenfield Dairy", "Inventory", 0, 1, 220_000, "GD-58");

function dateFor(seed: Seed, current: string): string {
  return `${shiftMonth(current, -seed.offset)}-${String(seed.day).padStart(2, "0")}`;
}

function mkInvoice(i: number, current: string, s: Seed): InvoiceRow {
  const tax = Math.round(s.cents * 0.13);
  const subtotal = s.cents - tax;
  const date = dateFor(s, current);
  return {
    id: `demo-inv-${i + 1}`,
    organization_id: DEMO_ORG.id,
    source: i % 3 === 0 ? "manual_upload" : "resend",
    original_filename: `${s.number}.pdf`,
    storage_path: "",
    sha256: String(i).padStart(64, "0"),
    provider_message_id: null,
    provider_attachment_id: null,
    status: "processed",
    supplier_name: s.supplier,
    normalized_supplier_name: normalizeSupplierName(s.supplier),
    invoice_number: s.number,
    invoice_date: date,
    due_date: null,
    category: s.category,
    currency: "CAD",
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: s.cents,
    validation_results: [],
    extraction_metadata: { mode: "demo" },
    created_at: `${date}T15:00:00Z`,
    updated_at: `${date}T15:00:00Z`,
  };
}

export function buildDemoInvoices(now: Date = new Date()): InvoiceRow[] {
  const current = currentMonthKey(now, DEMO_ORG.timezone);
  const invoices = SEEDS.map((s, i) => mkInvoice(i, current, s));
  const lastDay = `${shiftMonth(current, -1)}-28`;
  const nwPrev = invoices.find((x) => x.invoice_number === "NP-215")!;

  const issue = (code: string, message: string, relatedInvoiceId?: string): ValidationIssue => ({
    code,
    severity: "error",
    message,
    relatedInvoiceId,
  });
  const base = invoices.length;
  invoices.push({
    ...mkInvoice(base, current, {
      supplier: "Northwind Produce",
      category: "Inventory",
      offset: 1,
      day: 28,
      cents: nwPrev.total_cents!,
      number: "NP-215",
    }),
    id: "demo-inv-dup",
    status: "needs_review",
    invoice_date: lastDay,
    validation_results: [
      issue("POTENTIAL_DUPLICATE", "This may duplicate an existing invoice.", nwPrev.id),
    ],
  });
  invoices.push({
    ...mkInvoice(base + 1, current, {
      supplier: "Unreadable scan",
      category: "Other",
      offset: 1,
      day: 27,
      cents: 0,
      number: "",
    }),
    id: "demo-inv-review",
    status: "needs_review",
    supplier_name: null,
    normalized_supplier_name: null,
    invoice_number: null,
    category: null,
    total_cents: null,
    subtotal_cents: null,
    tax_cents: null,
    invoice_date: null,
    original_filename: "scan-0042.pdf",
    validation_results: [
      issue("MISSING_SUPPLIER", "Supplier name is missing."),
      issue("MISSING_INVOICE_NUMBER", "Invoice number is missing."),
      issue("MISSING_INVOICE_DATE", "Invoice date is missing."),
      issue("MISSING_TOTAL", "Total amount is missing."),
    ],
  });
  invoices.push({
    ...mkInvoice(base + 2, current, {
      supplier: "BoxWorks Packaging",
      category: "Packaging",
      offset: 1,
      day: 19,
      cents: 118_000,
      number: "BW-1015",
    }),
    id: "demo-inv-hash-dup",
    status: "duplicate",
    validation_results: [
      {
        code: "EXACT_DUPLICATE",
        severity: "warning",
        message: "Identical document already recorded.",
      },
    ],
  });
  return invoices.sort((a, b) => (b.invoice_date ?? "").localeCompare(a.invoice_date ?? ""));
}
