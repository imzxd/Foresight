import type {
  ExtractedInvoice,
  ExtractionInput,
  ExtractionResult,
  InvoiceExtractor,
} from "@/lib/invoices/extraction-schema";

/**
 * Deterministic extractor for tests and demos (clearly labelled "mock" in metadata).
 * It parses a simple "key: value" text layout so test PDFs can drive every code path.
 */
export class MockInvoiceExtractor implements InvoiceExtractor {
  calls = 0;
  constructor(
    private override?: (input: ExtractionInput) => ExtractedInvoice | Promise<ExtractedInvoice>,
  ) {}

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    this.calls++;
    const fields = this.override ? await this.override(input) : parseKeyValueText(input.text ?? "");
    return { fields, usage: { model: "mock-extractor", mode: "mock" } };
  }
}

const num = (v: string | undefined) => {
  if (v === undefined) return null;
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? n : null;
};

export function parseKeyValueText(text: string): ExtractedInvoice {
  const get = (key: string) =>
    text.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim();
  const category = get("category");
  return {
    supplier_name: get("supplier") ?? null,
    invoice_number: get("invoice number") ?? null,
    invoice_date: get("invoice date") ?? null,
    due_date: get("due date") ?? null,
    subtotal: num(get("subtotal")),
    tax: num(get("tax")),
    total: num(get("total")),
    currency: get("currency") ?? null,
    category: (category as ExtractedInvoice["category"]) ?? null,
  };
}
