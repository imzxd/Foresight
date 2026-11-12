import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInsights } from "./insights";
import { toDuplicateFlags, type FlagSource } from "./flags";
import type { AggregateRow } from "./aggregate";
import type { AnalyticsInvoice, Category } from "@/lib/invoices/types";
import { shiftMonth, currentMonthKey } from "./periods";

type AggDbRow = {
  month: string;
  category: Category;
  supplier: string | null;
  normalized_supplier: string;
  total_cents: number;
  invoice_count: number;
};

export function toAggregateRows(rows: AggDbRow[]): AggregateRow[] {
  return rows.map((r) => ({
    month: r.month,
    category: r.category,
    supplier: r.supplier ?? "Unknown",
    normalizedSupplier: r.normalized_supplier,
    totalCents: Number(r.total_cents),
    count: Number(r.invoice_count),
  }));
}

/** Window of history loaded for analytics (months before the current one). */
export const HISTORY_MONTHS = 13;

export async function loadAggregates(
  db: SupabaseClient,
  orgId: string,
  now: Date,
  timeZone: string,
) {
  const since = `${shiftMonth(currentMonthKey(now, timeZone), -HISTORY_MONTHS)}-01`;
  const { data, error } = await db.rpc("expense_aggregates", { org: orgId, since });
  if (error) throw new Error(`expense_aggregates: ${error.message}`);
  return toAggregateRows((data ?? []) as AggDbRow[]);
}

/**
 * Recompute and persist the full insight set for an organization.
 * Upserts by stable_key then deletes keys that no longer apply, so cards never go stale or duplicate.
 */
export async function recomputeInsights(
  db: SupabaseClient,
  orgId: string,
  now = new Date(),
): Promise<void> {
  const { data: org } = await db.from("organizations").select("timezone").eq("id", orgId).single();
  const timeZone = (org?.timezone as string | undefined) ?? "UTC";
  const rows = await loadAggregates(db, orgId, now, timeZone);

  const since = new Date(now.getTime() - 400 * 86_400_000).toISOString().slice(0, 10);
  const { data: inv } = await db
    .from("invoices")
    .select("id, supplier_name, normalized_supplier_name, invoice_date, category, total_cents")
    .eq("organization_id", orgId)
    .eq("status", "processed")
    .eq("currency", "CAD")
    .gte("invoice_date", since)
    .not("total_cents", "is", null)
    .order("invoice_date", { ascending: false })
    .limit(1000);
  const invoices: AnalyticsInvoice[] = (inv ?? []).map((r) => ({
    id: r.id as string,
    supplier: (r.supplier_name as string) ?? "Unknown",
    normalizedSupplier: (r.normalized_supplier_name as string) ?? "",
    date: r.invoice_date as string,
    category: ((r.category as Category) ?? "Other") as Category,
    totalCents: Number(r.total_cents),
  }));

  const { data: flagged } = await db
    .from("invoices")
    .select(
      "id, supplier_name, invoice_number, total_cents, currency, status, validation_results, created_at",
    )
    .eq("organization_id", orgId)
    .in("status", ["needs_review", "duplicate"])
    .order("created_at", { ascending: false })
    .limit(200);
  const duplicateFlags = toDuplicateFlags((flagged ?? []) as FlagSource[]);

  const drafts = buildInsights({
    rows,
    invoices,
    duplicateFlags: duplicateFlags.slice(0, 50),
    now,
    timeZone,
  });
  const computed_at = now.toISOString();
  if (drafts.length) {
    const { error } = await db.from("insights").upsert(
      drafts.map((d) => ({ ...d, organization_id: orgId, computed_at })),
      { onConflict: "organization_id,stable_key" },
    );
    if (error) throw new Error(`insights upsert: ${error.message}`);
  }
  // Remove anything not produced this run (stale findings).
  const { error: delErr } = await db
    .from("insights")
    .delete()
    .eq("organization_id", orgId)
    .lt("computed_at", computed_at);
  if (delErr) throw new Error(`insights cleanup: ${delErr.message}`);
}
