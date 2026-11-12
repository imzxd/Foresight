import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEntry, NewInvoice, PipelineStore } from "@/lib/invoices/pipeline";
import type { DuplicateCandidate } from "@/lib/invoices/duplicates";
import type { InvoiceRow } from "@/lib/invoices/types";

const BUCKET = "invoices";

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/** Supabase-backed PipelineStore. Uses the service-role client; callers must authorize the org first. */
export function createSupabaseStore(db: SupabaseClient): PipelineStore {
  return {
    async findInvoiceByHash(orgId, sha256) {
      const res = await db
        .from("invoices")
        .select("*")
        .eq("organization_id", orgId)
        .eq("sha256", sha256)
        .neq("status", "duplicate")
        .maybeSingle();
      return check(res, "findInvoiceByHash") as InvoiceRow | null;
    },
    async findInvoiceByProviderAttachment(orgId, messageId, attachmentId) {
      const res = await db
        .from("invoices")
        .select("*")
        .eq("organization_id", orgId)
        .eq("provider_message_id", messageId)
        .eq("provider_attachment_id", attachmentId)
        .limit(1)
        .maybeSingle();
      return check(res, "findInvoiceByProviderAttachment") as InvoiceRow | null;
    },
    async insertInvoice(row: NewInvoice) {
      return check(
        await db.from("invoices").insert(row).select("*").single(),
        "insertInvoice",
      ) as InvoiceRow;
    },
    async updateInvoice(id, patch) {
      return check(
        await db.from("invoices").update(patch).eq("id", id).select("*").single(),
        "updateInvoice",
      ) as InvoiceRow;
    },
    async getInvoice(orgId, id) {
      const res = await db
        .from("invoices")
        .select("*")
        .eq("organization_id", orgId)
        .eq("id", id)
        .maybeSingle();
      return check(res, "getInvoice") as InvoiceRow | null;
    },
    async listComparableInvoices(orgId, supplierNormalized) {
      const res = await db
        .from("invoices")
        .select("id, supplier_name, invoice_number, invoice_date, total_cents")
        .eq("organization_id", orgId)
        .eq("normalized_supplier_name", supplierNormalized)
        .in("status", ["processed", "needs_review"])
        .limit(500);
      return (check(res, "listComparableInvoices") ?? []) as DuplicateCandidate[];
    },
    async addAudit(entry: AuditEntry) {
      check(await db.from("invoice_audit_events").insert(entry).select("id").single(), "addAudit");
    },
    async putFile(path, bytes) {
      const { error } = await db.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (error) throw new Error(`putFile: ${error.message}`);
    },
    async getFile(path) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(`getFile: ${error?.message ?? "missing"}`);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
