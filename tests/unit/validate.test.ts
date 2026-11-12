import { describe, expect, it } from "vitest";
import type { ExtractedInvoice } from "@/lib/invoices/extraction-schema";
import { validateInvoiceFields } from "@/lib/invoices/validate";
import { findPotentialDuplicates } from "@/lib/invoices/duplicates";
import { normalizeSupplierName, parseIsoDate } from "@/lib/invoices/normalize";
import { assertPdfBasics, DocumentRejectedError, sha256Hex } from "@/lib/invoices/pdf";

const NOW = new Date("2026-06-15T12:00:00Z");
const good: ExtractedInvoice = {
  supplier_name: "Fresh Foods Inc.",
  invoice_number: "INV-1001",
  invoice_date: "2026-06-01",
  due_date: "2026-07-01",
  subtotal: 100,
  tax: 13,
  total: 113,
  currency: "CAD",
  category: "Inventory",
};
const codes = (r: ExtractedInvoice) => validateInvoiceFields(r, NOW).issues.map((i) => i.code);

describe("validateInvoiceFields", () => {
  it("accepts a clean invoice and converts to cents", () => {
    const out = validateInvoiceFields(good, NOW);
    expect(out.status).toBe("processed");
    expect(out.fields.total_cents).toBe(11300);
    expect(out.fields.normalized_supplier_name).toBe("fresh foods");
  });

  it("flags missing required fields without inventing values", () => {
    const out = validateInvoiceFields(
      {
        ...good,
        supplier_name: null,
        invoice_number: null,
        invoice_date: null,
        total: null,
        category: null,
      },
      NOW,
    );
    expect(out.status).toBe("needs_review");
    expect(out.fields.supplier_name).toBeNull();
    expect(out.fields.total_cents).toBeNull();
    expect(out.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "MISSING_SUPPLIER",
        "MISSING_INVOICE_NUMBER",
        "MISSING_INVOICE_DATE",
        "MISSING_TOTAL",
        "MISSING_CATEGORY",
      ]),
    );
  });

  it("flags subtotal + tax mismatch", () => {
    expect(codes({ ...good, total: 150 })).toContain("TOTAL_MISMATCH");
  });
  it("tolerates two-cent rounding differences", () => {
    expect(validateInvoiceFields({ ...good, total: 113.02 }, NOW).status).toBe("processed");
  });
  it("flags invalid, future and implausible dates", () => {
    expect(codes({ ...good, invoice_date: "2026-02-31" })).toContain("INVALID_INVOICE_DATE");
    expect(codes({ ...good, invoice_date: "2027-01-01" })).toContain("FUTURE_INVOICE_DATE");
    expect(codes({ ...good, invoice_date: "1999-01-01" })).toContain("IMPLAUSIBLE_INVOICE_DATE");
  });
  it("flags unsupported currencies and never converts", () => {
    const out = validateInvoiceFields({ ...good, currency: "usd" }, NOW);
    expect(out.status).toBe("needs_review");
    expect(out.issues.map((i) => i.code)).toContain("UNSUPPORTED_CURRENCY");
    expect(out.fields.total_cents).toBe(11300);
  });
  it("flags non-positive and absurd totals", () => {
    expect(codes({ ...good, subtotal: null, tax: null, total: 0 })).toContain("NON_POSITIVE_TOTAL");
    expect(codes({ ...good, subtotal: null, tax: null, total: 99_999_999 })).toContain(
      "UNREASONABLE_TOTAL",
    );
  });
  it("treats a missing subtotal/tax as a warning only", () => {
    const out = validateInvoiceFields({ ...good, subtotal: null, tax: null }, NOW);
    expect(out.status).toBe("processed");
    expect(out.issues.map((i) => i.code)).toContain("PARTIAL_AMOUNTS");
  });
});

describe("duplicates", () => {
  const existing = {
    id: "a",
    supplier_name: "ABC Supplies Ltd",
    invoice_number: "00123",
    invoice_date: "2026-05-01",
    total_cents: 5000,
  };
  it("matches same supplier + invoice number regardless of formatting", () => {
    const m = findPotentialDuplicates(
      {
        id: "b",
        supplier_name: "abc supplies",
        invoice_number: "INV-123",
        invoice_date: "2026-05-09",
        total_cents: 1,
      },
      [existing],
    );
    expect(m).toEqual([]); // "inv123" vs "123": different on purpose
    const m2 = findPotentialDuplicates(
      {
        id: "b",
        supplier_name: "ABC Supplies",
        invoice_number: "123",
        invoice_date: "2026-05-09",
        total_cents: 1,
      },
      [existing],
    );
    expect(m2).toEqual([{ invoiceId: "a", reason: "same_supplier_and_number" }]);
  });
  it("matches same supplier/date/total when numbers differ", () => {
    const m = findPotentialDuplicates(
      {
        id: "b",
        supplier_name: "ABC Supplies",
        invoice_number: "999",
        invoice_date: "2026-05-01",
        total_cents: 5000,
      },
      [existing],
    );
    expect(m[0]?.reason).toBe("same_supplier_date_total");
  });
  it("does not match other suppliers or itself", () => {
    expect(findPotentialDuplicates({ ...existing, id: "a" }, [existing])).toEqual([]);
    expect(
      findPotentialDuplicates({ ...existing, id: "z", supplier_name: "Other Co" }, [existing]),
    ).toEqual([]);
  });
});

describe("normalization and file checks", () => {
  it("normalizes supplier names", () => {
    expect(normalizeSupplierName("  Fresh   Foods, INC. ")).toBe("fresh foods");
    expect(normalizeSupplierName("Smith & Sons Ltd")).toBe("smith and sons");
  });
  it("validates real calendar dates", () => {
    expect(parseIsoDate("2024-02-29")).toBe("2024-02-29");
    expect(parseIsoDate("2025-02-29")).toBeNull();
    expect(parseIsoDate("06/01/2026")).toBeNull();
  });
  it("rejects non-PDFs, empty and oversized files", () => {
    const reject = (bytes: Uint8Array, max?: number) => {
      try {
        assertPdfBasics(bytes, max);
      } catch (e) {
        return (e as DocumentRejectedError).code;
      }
      return "ok";
    };
    expect(reject(new Uint8Array())).toBe("EMPTY");
    expect(reject(new TextEncoder().encode("hello world"))).toBe("NOT_PDF");
    expect(reject(new TextEncoder().encode("%PDF-1.7 ..."), 5)).toBe("TOO_LARGE");
    expect(reject(new TextEncoder().encode("%PDF-1.7 ..."))).toBe("ok");
  });
  it("hashes deterministically", async () => {
    const a = await sha256Hex(new TextEncoder().encode("abc"));
    expect(a).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
