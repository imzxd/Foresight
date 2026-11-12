import { PDFDocument, StandardFonts } from "pdf-lib";
import type { DuplicateCandidate } from "@/lib/invoices/duplicates";
import type { AuditEntry, NewInvoice, PipelineDeps, PipelineStore } from "@/lib/invoices/pipeline";
import type { InvoiceRow } from "@/lib/invoices/types";
import { MockInvoiceExtractor } from "@/lib/ai/mock-extractor";
import type { InvoiceExtractor } from "@/lib/invoices/extraction-schema";
import { inspectPdf } from "@/lib/ai/pdf-inspect";

/** In-memory PipelineStore that enforces the same uniqueness rules as the SQL indexes. */
export class MemoryStore implements PipelineStore {
  invoices: InvoiceRow[] = [];
  audit: AuditEntry[] = [];
  files = new Map<string, Uint8Array>();
  private n = 0;

  async findInvoiceByHash(orgId: string, sha: string) {
    return (
      this.invoices.find(
        (i) => i.organization_id === orgId && i.sha256 === sha && i.status !== "duplicate",
      ) ?? null
    );
  }
  async findInvoiceByProviderAttachment(orgId: string, m: string, a: string) {
    return (
      this.invoices.find(
        (i) =>
          i.organization_id === orgId &&
          i.provider_message_id === m &&
          i.provider_attachment_id === a,
      ) ?? null
    );
  }
  async insertInvoice(row: NewInvoice) {
    if (
      row.status !== "duplicate" &&
      this.invoices.some(
        (i) =>
          i.organization_id === row.organization_id &&
          i.sha256 === row.sha256 &&
          i.status !== "duplicate",
      )
    )
      throw new Error("unique violation");
    const now = new Date().toISOString();
    const inv: InvoiceRow = {
      id: `inv-${++this.n}`,
      provider_message_id: null,
      provider_attachment_id: null,
      supplier_name: null,
      normalized_supplier_name: null,
      invoice_number: null,
      invoice_date: null,
      due_date: null,
      category: null,
      currency: null,
      subtotal_cents: null,
      tax_cents: null,
      total_cents: null,
      validation_results: [],
      extraction_metadata: {},
      created_at: now,
      updated_at: now,
      ...row,
    } as InvoiceRow;
    this.invoices.push(inv);
    return { ...inv };
  }
  async updateInvoice(id: string, patch: Partial<InvoiceRow>) {
    const inv = this.invoices.find((i) => i.id === id)!;
    Object.assign(inv, patch);
    return { ...inv };
  }
  async getInvoice(orgId: string, id: string) {
    const inv = this.invoices.find((i) => i.id === id && i.organization_id === orgId);
    return inv ? { ...inv } : null;
  }
  async listComparableInvoices(orgId: string, supplier: string): Promise<DuplicateCandidate[]> {
    return this.invoices.filter(
      (i) =>
        i.organization_id === orgId &&
        i.normalized_supplier_name === supplier &&
        (i.status === "processed" || i.status === "needs_review"),
    );
  }
  async addAudit(entry: AuditEntry) {
    this.audit.push(entry);
  }
  async putFile(path: string, bytes: Uint8Array) {
    this.files.set(path, bytes);
  }
  async getFile(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error("missing file");
    return f;
  }
}

export function makeDeps(opts: { extractor?: InvoiceExtractor; store?: MemoryStore } = {}) {
  const store = opts.store ?? new MemoryStore();
  const extractor = opts.extractor ?? new MockInvoiceExtractor();
  const changed: string[] = [];
  const deps: PipelineDeps = {
    store,
    extractor,
    inspectPdf,
    onInvoicesChanged: async (org) => {
      changed.push(org);
    },
    retry: { attempts: 3, baseDelayMs: 1 },
    now: () => new Date("2026-06-15T12:00:00Z"),
  };
  return { deps, store, extractor, changed };
}

export type InvoiceText = Partial<
  Record<
    | "supplier"
    | "invoice number"
    | "invoice date"
    | "due date"
    | "subtotal"
    | "tax"
    | "total"
    | "currency"
    | "category",
    string
  >
>;

export const GOOD_INVOICE: InvoiceText = {
  supplier: "Fresh Foods Inc.",
  "invoice number": "INV-1001",
  "invoice date": "2026-06-01",
  subtotal: "100.00",
  tax: "13.00",
  total: "113.00",
  currency: "CAD",
  category: "Inventory",
};

/** Builds a real text-based PDF so the local text-extraction path is exercised. */
export async function makePdf(fields: InvoiceText, extraText = ""): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  let y = 740;
  for (const [k, v] of Object.entries(fields)) {
    page.drawText(`${k}: ${v}`, { x: 50, y, size: 12, font });
    y -= 20;
  }
  if (extraText) page.drawText(extraText, { x: 50, y: y - 10, size: 10, font });
  return doc.save();
}
