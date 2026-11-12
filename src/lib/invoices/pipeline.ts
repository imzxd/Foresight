import {
  extractionSchema,
  type ExtractedInvoice,
  type InvoiceExtractor,
} from "./extraction-schema";
import { findPotentialDuplicates, type DuplicateCandidate } from "./duplicates";
import {
  assertPdfBasics,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_PAGES,
  DocumentRejectedError,
  sha256Hex,
} from "./pdf";
import type { InvoiceRow, InvoiceSource, ValidationIssue } from "./types";
import { validateInvoiceFields, type NormalizedInvoiceFields } from "./validate";

/**
 * The single invoice pipeline shared by manual uploads and emailed attachments.
 * It only talks to the outside world through `PipelineDeps`, which keeps it testable and keeps
 * extraction, storage and database concerns separate.
 */

export type NewInvoice = Pick<
  InvoiceRow,
  "organization_id" | "source" | "original_filename" | "storage_path" | "sha256" | "status"
> &
  Partial<
    Pick<
      InvoiceRow,
      | "provider_message_id"
      | "provider_attachment_id"
      | "validation_results"
      | "extraction_metadata"
    >
  >;

export type AuditEntry = {
  invoice_id: string;
  organization_id: string;
  actor: string;
  action: string;
  changed_fields: Record<string, unknown>;
};

export interface PipelineStore {
  findInvoiceByHash(orgId: string, sha256: string): Promise<InvoiceRow | null>;
  findInvoiceByProviderAttachment(
    orgId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<InvoiceRow | null>;
  insertInvoice(row: NewInvoice): Promise<InvoiceRow>;
  updateInvoice(id: string, patch: Partial<InvoiceRow>): Promise<InvoiceRow>;
  getInvoice(orgId: string, id: string): Promise<InvoiceRow | null>;
  listComparableInvoices(orgId: string, supplierNormalized: string): Promise<DuplicateCandidate[]>;
  addAudit(entry: AuditEntry): Promise<void>;
  putFile(path: string, bytes: Uint8Array): Promise<void>;
  getFile(path: string): Promise<Uint8Array>;
}

export type PdfInspection = { pages: number; text: string | null };

export interface PipelineDeps {
  store: PipelineStore;
  extractor: InvoiceExtractor;
  /** Local text extraction; text is null for scanned PDFs so the extractor can fall back to vision. */
  inspectPdf(bytes: Uint8Array): Promise<PdfInspection>;
  /** Recompute persisted insights; called whenever counted data may have changed. */
  onInvoicesChanged(orgId: string): Promise<void>;
  limits?: { maxBytes?: number; maxPages?: number };
  retry?: { attempts: number; baseDelayMs: number };
  log?: (event: string, data: Record<string, unknown>) => void;
  newId?: () => string;
  now?: () => Date;
}

export type IngestInput = {
  orgId: string;
  source: InvoiceSource;
  filename: string;
  bytes: Uint8Array;
  messageId?: string | null;
  attachmentId?: string | null;
};

export type IngestOutcome =
  | { kind: "created"; invoice: InvoiceRow }
  | { kind: "duplicate"; invoice: InvoiceRow; originalId: string }
  | { kind: "existing"; invoice: InvoiceRow };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stage A: validate, fingerprint, de-duplicate, store privately and record a `received` invoice. */
export async function ingestDocument(
  deps: PipelineDeps,
  input: IngestInput,
): Promise<IngestOutcome> {
  const { store } = deps;
  assertPdfBasics(input.bytes, deps.limits?.maxBytes ?? DEFAULT_MAX_BYTES);

  if (input.messageId && input.attachmentId) {
    const seen = await store.findInvoiceByProviderAttachment(
      input.orgId,
      input.messageId,
      input.attachmentId,
    );
    if (seen) return { kind: "existing", invoice: seen };
  }

  const sha256 = await sha256Hex(input.bytes);
  const original = await store.findInvoiceByHash(input.orgId, sha256);
  const base = {
    organization_id: input.orgId,
    source: input.source,
    original_filename: input.filename.slice(0, 200),
    sha256,
    provider_message_id: input.messageId ?? null,
    provider_attachment_id: input.attachmentId ?? null,
  };

  if (original) {
    const invoice = await store.insertInvoice({
      ...base,
      storage_path: original.storage_path,
      status: "duplicate",
      validation_results: [
        {
          code: "EXACT_DUPLICATE",
          severity: "warning",
          message: "Identical document already recorded.",
          relatedInvoiceId: original.id,
        },
      ],
    });
    await store.addAudit({
      invoice_id: invoice.id,
      organization_id: input.orgId,
      actor: "system",
      action: "exact_duplicate_detected",
      changed_fields: { duplicateOf: original.id },
    });
    deps.log?.("invoice.duplicate_hash", { orgId: input.orgId });
    await deps.onInvoicesChanged(input.orgId);
    return { kind: "duplicate", invoice, originalId: original.id };
  }

  const id = deps.newId?.() ?? crypto.randomUUID();
  const storage_path = `${input.orgId}/${id}.pdf`;
  await store.putFile(storage_path, input.bytes);
  try {
    const invoice = await store.insertInvoice({ ...base, storage_path, status: "received" });
    return { kind: "created", invoice };
  } catch (e) {
    // A concurrent identical delivery may have won the unique index race; treat it as a duplicate/existing.
    const winner = await store.findInvoiceByHash(input.orgId, sha256);
    if (winner) return { kind: "existing", invoice: winner };
    throw e;
  }
}

async function extractWithRetry(
  deps: PipelineDeps,
  args: Parameters<InvoiceExtractor["extract"]>[0],
) {
  const attempts = deps.retry?.attempts ?? 3;
  const base = deps.retry?.baseDelayMs ?? 1000;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await deps.extractor.extract(args);
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await sleep(base * 2 ** i);
    }
  }
  throw lastError;
}

const EMPTY_EXTRACTION: ExtractedInvoice = {
  supplier_name: null,
  invoice_number: null,
  invoice_date: null,
  due_date: null,
  subtotal: null,
  tax: null,
  total: null,
  currency: null,
  category: null,
};

/** Adds the cross-invoice duplicate check on top of field validation. */
export async function validateWithDuplicates(
  deps: Pick<PipelineDeps, "store" | "now">,
  orgId: string,
  invoiceId: string,
  raw: ExtractedInvoice,
) {
  const outcome = validateInvoiceFields(raw, deps.now?.());
  const issues: ValidationIssue[] = [...outcome.issues];
  let status = outcome.status;
  const supplierKey = outcome.fields.normalized_supplier_name;
  if (supplierKey) {
    const others = await deps.store.listComparableInvoices(orgId, supplierKey);
    const matches = findPotentialDuplicates(
      {
        id: invoiceId,
        supplier_name: outcome.fields.supplier_name,
        invoice_number: outcome.fields.invoice_number,
        invoice_date: outcome.fields.invoice_date,
        total_cents: outcome.fields.total_cents,
      },
      others,
    );
    for (const m of matches) {
      issues.push({
        code: "POTENTIAL_DUPLICATE",
        severity: "error",
        message: "This may duplicate an existing invoice.",
        relatedInvoiceId: m.invoiceId,
      });
    }
    if (matches.length) status = "needs_review";
  }
  return { fields: outcome.fields as NormalizedInvoiceFields, issues, status };
}

/** Stage B: read the stored document, extract, validate and save with the right status. */
export async function processInvoice(
  deps: PipelineDeps,
  orgId: string,
  invoiceId: string,
): Promise<InvoiceRow> {
  const { store } = deps;
  const invoice = await store.getInvoice(orgId, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (
    invoice.status !== "received" &&
    invoice.status !== "processing" &&
    invoice.status !== "failed"
  )
    return invoice;

  const started = Date.now();
  await store.updateInvoice(invoiceId, { status: "processing" });

  const fail = async (message: string, extra: Record<string, unknown> = {}) => {
    const failed = await store.updateInvoice(invoiceId, {
      status: "failed",
      validation_results: [{ code: "PROCESSING_FAILED", severity: "error", message }],
      extraction_metadata: { ...extra, durationMs: Date.now() - started },
    });
    await store.addAudit({
      invoice_id: invoiceId,
      organization_id: orgId,
      actor: "system",
      action: "processing_failed",
      changed_fields: { reason: message },
    });
    deps.log?.("invoice.failed", { orgId, reason: message });
    return failed;
  };

  try {
    const bytes = await store.getFile(invoice.storage_path);
    const inspection = await deps.inspectPdf(bytes);
    if (inspection.pages > (deps.limits?.maxPages ?? DEFAULT_MAX_PAGES))
      return await fail(`Document has ${inspection.pages} pages, which exceeds the page limit.`);

    let raw = EMPTY_EXTRACTION;
    let usage: Record<string, unknown> = {};
    let extractionNote: ValidationIssue | null = null;
    try {
      const result = await extractWithRetry(deps, {
        filename: invoice.original_filename,
        pdf: bytes,
        text: inspection.text,
      });
      const parsed = extractionSchema.safeParse(result.fields);
      if (parsed.success) raw = parsed.data;
      else
        extractionNote = {
          code: "INVALID_EXTRACTION_OUTPUT",
          severity: "error",
          message: "The extraction result was malformed; please enter the details manually.",
        };
      usage = { ...result.usage };
    } catch (e) {
      deps.log?.("invoice.extraction_error", {
        orgId,
        error: e instanceof Error ? e.name : "unknown",
      });
      return await fail(
        "Automatic extraction failed after several attempts. You can retry or enter details manually.",
        {
          pages: inspection.pages,
        },
      );
    }

    const checked = await validateWithDuplicates(deps, orgId, invoiceId, raw);
    const issues = extractionNote ? [extractionNote, ...checked.issues] : checked.issues;
    const status = extractionNote ? "needs_review" : checked.status;
    const saved = await store.updateInvoice(invoiceId, {
      ...checked.fields,
      status,
      validation_results: issues,
      extraction_metadata: { ...usage, pages: inspection.pages, durationMs: Date.now() - started },
    });
    await store.addAudit({
      invoice_id: invoiceId,
      organization_id: orgId,
      actor: "system",
      action: "extracted",
      changed_fields: { status },
    });
    deps.log?.("invoice.processed", { orgId, status, durationMs: Date.now() - started, ...usage });
    await deps.onInvoicesChanged(orgId);
    return saved;
  } catch (e) {
    if (e instanceof DocumentRejectedError) return await fail(e.message);
    throw e;
  }
}
