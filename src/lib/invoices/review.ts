import { z } from "zod";
import { parseMoneyToCents } from "@/lib/utils/money";
import { extractionSchema, type ExtractedInvoice } from "./extraction-schema";
import { validateWithDuplicates, type PipelineDeps } from "./pipeline";
import { CATEGORIES, type InvoiceRow } from "./types";

/** Form values submitted by the review UI (amounts as strings exactly as typed). */
export const correctionSchema = z.object({
  supplier_name: z.string().max(200),
  invoice_number: z.string().max(100),
  invoice_date: z.string().max(10),
  due_date: z.string().max(10),
  subtotal: z.string().max(20),
  tax: z.string().max(20),
  total: z.string().max(20),
  currency: z.string().max(3),
  category: z.enum(CATEGORIES).or(z.literal("")),
});
export type CorrectionInput = z.infer<typeof correctionSchema>;

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** Amount strings that are present but unparseable stay as NaN so validation flags them. */
function moneyField(s: string): number | null {
  const v = blankToNull(s);
  if (v === null) return null;
  const cents = parseMoneyToCents(v);
  return cents === null ? Number.NaN : cents / 100;
}

export function correctionToExtraction(c: CorrectionInput): ExtractedInvoice {
  return {
    supplier_name: blankToNull(c.supplier_name),
    invoice_number: blankToNull(c.invoice_number),
    invoice_date: blankToNull(c.invoice_date),
    due_date: blankToNull(c.due_date),
    subtotal: moneyField(c.subtotal),
    tax: moneyField(c.tax),
    total: moneyField(c.total),
    currency: blankToNull(c.currency)?.toUpperCase() ?? null,
    category: c.category === "" ? null : c.category,
  };
}

const TRACKED = [
  "supplier_name",
  "invoice_number",
  "invoice_date",
  "due_date",
  "category",
  "currency",
  "subtotal_cents",
  "tax_cents",
  "total_cents",
] as const;

function diff(before: InvoiceRow, after: Partial<InvoiceRow>) {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of TRACKED) {
    if (k in after && before[k] !== after[k])
      changed[k] = { from: before[k], to: after[k] ?? null };
  }
  return changed;
}

export type ReviewResult =
  | { ok: true; invoice: InvoiceRow }
  | { ok: false; error: string; issues?: InvoiceRow["validation_results"] };

type ReviewArgs = { deps: PipelineDeps; orgId: string; invoiceId: string; actor: string };

/**
 * Human correction. `approve` makes the record count toward analytics, but only when deterministic
 * validation passes; a human may knowingly override a *potential duplicate* flag (audited).
 */
export async function reviewInvoice(
  { deps, orgId, invoiceId, actor }: ReviewArgs,
  input: CorrectionInput,
  decision: "save" | "approve",
): Promise<ReviewResult> {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some fields are too long or malformed." };
  const invoice = await deps.store.getInvoice(orgId, invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status === "duplicate")
    return { ok: false, error: "Duplicate invoices are read-only." };
  if (invoice.status === "received" || invoice.status === "processing")
    return { ok: false, error: "This invoice is still being processed." };

  const raw = extractionSchema.safeParse(correctionToExtraction(parsed.data));
  // NaN fails z.number(); map unparseable amounts to a clear message instead.
  if (!raw.success)
    return { ok: false, error: "One of the amounts is not a valid number (for example 1234.56)." };

  const checked = await validateWithDuplicates(deps, orgId, invoiceId, raw.data);
  const blocking = checked.issues.filter((i) => i.severity === "error");
  const blockingExceptDuplicate = blocking.filter((i) => i.code !== "POTENTIAL_DUPLICATE");
  const overrodeDuplicate = blocking.some((i) => i.code === "POTENTIAL_DUPLICATE");

  if (decision === "approve" && blockingExceptDuplicate.length)
    return {
      ok: false,
      error: "Fix the highlighted problems before approving.",
      issues: checked.issues,
    };

  const status =
    decision === "approve" ? "processed" : blocking.length ? "needs_review" : "processed";
  const patch: Partial<InvoiceRow> = {
    ...checked.fields,
    status,
    validation_results: checked.issues,
  };
  const saved = await deps.store.updateInvoice(invoiceId, patch);
  await deps.store.addAudit({
    invoice_id: invoiceId,
    organization_id: orgId,
    actor,
    action: decision === "approve" ? "approved" : "corrected",
    changed_fields: {
      ...diff(invoice, patch),
      ...(overrodeDuplicate && decision === "approve" ? { duplicateOverride: true } : {}),
    },
  });
  await deps.onInvoicesChanged(orgId);
  return { ok: true, invoice: saved };
}

/** Owner confirms a flagged invoice is a duplicate; it is excluded from all totals. */
export async function markDuplicate({
  deps,
  orgId,
  invoiceId,
  actor,
}: ReviewArgs): Promise<ReviewResult> {
  const invoice = await deps.store.getInvoice(orgId, invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  const saved = await deps.store.updateInvoice(invoiceId, { status: "duplicate" });
  await deps.store.addAudit({
    invoice_id: invoiceId,
    organization_id: orgId,
    actor,
    action: "marked_duplicate",
    changed_fields: { status: { from: invoice.status, to: "duplicate" } },
  });
  await deps.onInvoicesChanged(orgId);
  return { ok: true, invoice: saved };
}
