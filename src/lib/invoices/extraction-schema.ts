import { z } from "zod";
import { CATEGORIES } from "./types";

/** Raw structured output expected from any extractor. Unknown values must be null. */
export const extractionSchema = z.object({
  supplier_name: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  due_date: z.string().nullable(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  currency: z.string().nullable(),
  category: z.enum(CATEGORIES).nullable(),
});
export type ExtractedInvoice = z.infer<typeof extractionSchema>;

/** JSON Schema twin of extractionSchema for provider structured-output requests. */
export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "supplier_name",
    "invoice_number",
    "invoice_date",
    "due_date",
    "subtotal",
    "tax",
    "total",
    "currency",
    "category",
  ],
  properties: {
    supplier_name: { type: ["string", "null"] },
    invoice_number: { type: ["string", "null"] },
    invoice_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    due_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    currency: { type: ["string", "null"], description: "ISO 4217 code" },
    category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
  },
} as const;

export type ExtractionUsage = {
  model: string;
  mode: "text" | "vision" | "mock";
  inputTokens?: number;
  outputTokens?: number;
};

export type ExtractionResult = {
  fields: ExtractedInvoice;
  usage: ExtractionUsage;
};

export type ExtractionInput = {
  filename: string;
  pdf: Uint8Array;
  /** Locally extracted text when the PDF is text-based; null means scanned/unreadable. */
  text: string | null;
};

export interface InvoiceExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}
