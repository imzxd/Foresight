/**
 * Loads FICTIONAL demo invoices into a live organization so you can see charts and insights.
 *   pnpm seed:demo -- <organization_id>
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Rows are tagged
 * extraction_metadata.mode = "demo-seed"; remove them with --remove.
 */
import { createClient } from "@supabase/supabase-js";
import { buildDemoInvoices } from "../src/lib/demo/data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgId = process.argv.slice(2).find((a) => !a.startsWith("--"));
const remove = process.argv.includes("--remove");

if (!url || !key || !orgId) {
  console.error("Usage: pnpm seed:demo -- <organization_id> [--remove]  (needs Supabase env vars)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  if (remove) {
    const { error } = await db
      .from("invoices")
      .delete()
      .eq("organization_id", orgId)
      .contains("extraction_metadata", { mode: "demo-seed" });
    if (error) throw error;
    console.log("Removed seeded demo invoices.");
    return;
  }
  const rows = buildDemoInvoices().map((inv, i) => ({
    organization_id: orgId,
    source: inv.source,
    original_filename: inv.original_filename,
    storage_path: `demo-seed/${orgId}/${i}.pdf`,
    sha256: `${i}`.padStart(8, "0").repeat(8),
    status: inv.status,
    supplier_name: inv.supplier_name,
    normalized_supplier_name: inv.normalized_supplier_name,
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    category: inv.category,
    currency: inv.currency,
    subtotal_cents: inv.subtotal_cents,
    tax_cents: inv.tax_cents,
    total_cents: inv.total_cents,
    validation_results: inv.validation_results,
    extraction_metadata: { mode: "demo-seed" },
  }));
  const { error } = await db.from("invoices").insert(rows);
  if (error) throw error;
  console.log(
    `Inserted ${rows.length} fictional invoices. Open the app to see them; insights refresh when an invoice next changes.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
