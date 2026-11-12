import type { PdfInspection } from "@/lib/invoices/pipeline";
import { DocumentRejectedError } from "@/lib/invoices/pdf";

/** Local text extraction (no network, no AI). Returns text=null when the PDF has no text layer. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    return { pages: totalPages, text: joined.trim().length >= 40 ? joined : null };
  } catch {
    throw new DocumentRejectedError(
      "UNREADABLE",
      "The PDF could not be read (it may be corrupt or encrypted).",
    );
  }
}
