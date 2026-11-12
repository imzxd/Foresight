import "server-only";
import { aggregateInvoices, buildOverview, type Overview } from "@/lib/analytics/overview";
import { toDuplicateFlags } from "@/lib/analytics/flags";
import { buildInsights, type InsightDraft } from "@/lib/analytics/insights";
import { loadAggregates } from "@/lib/analytics/recompute";
import type { AppContext } from "@/lib/auth/session";
import { buildDemoInvoices, DEMO_ORG } from "@/lib/demo/data";
import { env, inboxAddress } from "@/lib/env";
import type { AnalyticsInvoice, InvoiceRow, InvoiceStatus } from "@/lib/invoices/types";
import { createAdminClient } from "@/lib/db/clients";

export type InsightView = Omit<InsightDraft, "stable_key"> & { id: string; computed_at: string };
export type InvoiceListItem = Pick<
  InvoiceRow,
  | "id"
  | "supplier_name"
  | "invoice_number"
  | "invoice_date"
  | "category"
  | "total_cents"
  | "currency"
  | "source"
  | "status"
  | "original_filename"
  | "created_at"
>;

const LIST_COLUMNS =
  "id, supplier_name, invoice_number, invoice_date, category, total_cents, currency, source, status, original_filename, created_at";
export const PAGE_SIZE = 15;

function demoInsights(now: Date): InsightView[] {
  const invoices = buildDemoInvoices(now);
  const analytics: AnalyticsInvoice[] = invoices
    .filter((i) => i.status === "processed")
    .map((i) => ({
      id: i.id,
      supplier: i.supplier_name!,
      normalizedSupplier: i.normalized_supplier_name!,
      date: i.invoice_date!,
      category: i.category!,
      totalCents: i.total_cents!,
    }));
  return buildInsights({
    rows: aggregateInvoices(invoices),
    invoices: analytics,
    duplicateFlags: toDuplicateFlags(invoices),
    now,
    timeZone: DEMO_ORG.timezone,
  }).map(({ stable_key, ...rest }) => ({
    ...rest,
    id: stable_key,
    computed_at: now.toISOString(),
  }));
}

export async function getInsights(ctx: AppContext, limit = 50): Promise<InsightView[]> {
  if (ctx.mode === "demo") return demoInsights(new Date()).slice(0, limit);
  const { data } = await ctx.db
    .from("insights")
    .select(
      "id, kind, severity, title, body, evidence, related_invoice_ids, reporting_period, computed_at",
    )
    .eq("organization_id", ctx.org.id)
    .order("computed_at", { ascending: false })
    .limit(limit);
  const order = { critical: 0, warning: 1, info: 2 } as const;
  return ((data ?? []) as InsightView[]).sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function getOverviewData(ctx: AppContext): Promise<{
  overview: Overview;
  reviewCount: number;
  recent: InvoiceListItem[];
  insights: InsightView[];
}> {
  const now = new Date();
  if (ctx.mode === "demo") {
    const invoices = buildDemoInvoices(now);
    return {
      overview: buildOverview(aggregateInvoices(invoices), now, ctx.org.timezone),
      reviewCount: invoices.filter((i) => i.status === "needs_review").length,
      recent: invoices.slice(0, 6),
      insights: demoInsights(now).slice(0, 4),
    };
  }
  const rows = await loadAggregates(ctx.db, ctx.org.id, now, ctx.org.timezone);
  const [{ count }, { data: recent }, insights] = await Promise.all([
    ctx.db
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.org.id)
      .eq("status", "needs_review"),
    ctx.db
      .from("invoices")
      .select(LIST_COLUMNS)
      .eq("organization_id", ctx.org.id)
      .order("created_at", { ascending: false })
      .limit(6),
    getInsights(ctx, 4),
  ]);
  return {
    overview: buildOverview(rows, now, ctx.org.timezone),
    reviewCount: count ?? 0,
    recent: (recent ?? []) as InvoiceListItem[],
    insights,
  };
}

export type InvoiceQuery = { q?: string; status?: string; category?: string; page?: number };

export async function listInvoices(ctx: AppContext, query: InvoiceQuery) {
  const page = Math.max(1, query.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  if (ctx.mode === "demo") {
    const q = query.q?.toLowerCase();
    const all = buildDemoInvoices().filter(
      (i) =>
        (!query.status || i.status === query.status) &&
        (!query.category || i.category === query.category) &&
        (!q || `${i.supplier_name ?? ""} ${i.invoice_number ?? ""}`.toLowerCase().includes(q)),
    );
    return {
      items: all.slice(from, from + PAGE_SIZE) as InvoiceListItem[],
      total: all.length,
      page,
    };
  }
  let req = ctx.db
    .from("invoices")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("organization_id", ctx.org.id)
    .order("invoice_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (query.status) req = req.eq("status", query.status as InvoiceStatus);
  if (query.category) req = req.eq("category", query.category);
  if (query.q) {
    // Strip PostgREST filter syntax characters from user input.
    const safe = query.q
      .replace(/[%,()*\\]/g, " ")
      .trim()
      .slice(0, 80);
    if (safe) req = req.or(`supplier_name.ilike.%${safe}%,invoice_number.ilike.%${safe}%`);
  }
  const { data, count } = await req;
  return { items: (data ?? []) as InvoiceListItem[], total: count ?? 0, page };
}

export type AuditView = {
  id: string;
  actor: string;
  action: string;
  changed_fields: Record<string, unknown>;
  created_at: string;
};

export async function getInvoiceDetail(ctx: AppContext, id: string) {
  if (ctx.mode === "demo") {
    const invoices = buildDemoInvoices();
    const invoice = invoices.find((i) => i.id === id);
    if (!invoice) return null;
    const relatedIds = invoice.validation_results
      .map((v) => v.relatedInvoiceId)
      .filter(Boolean) as string[];
    return {
      invoice,
      audit: [] as AuditView[],
      related: invoices.filter((i) => relatedIds.includes(i.id)),
      downloadUrl: null as string | null,
    };
  }
  const { data: invoice } = await ctx.db
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!invoice) return null;
  const inv = invoice as InvoiceRow;
  const relatedIds = inv.validation_results
    .map((v) => v.relatedInvoiceId)
    .filter(Boolean) as string[];
  const [{ data: audit }, relatedRes] = await Promise.all([
    ctx.db
      .from("invoice_audit_events")
      .select("id, actor, action, changed_fields, created_at")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false }),
    relatedIds.length
      ? ctx.db.from("invoices").select("*").eq("organization_id", ctx.org.id).in("id", relatedIds)
      : Promise.resolve({ data: [] }),
  ]);
  // Short-lived signed URL; generated only after RLS confirmed the user can see this invoice.
  const { data: signed } = await createAdminClient()
    .storage.from("invoices")
    .createSignedUrl(inv.storage_path, 120);
  return {
    invoice: inv,
    audit: (audit ?? []) as AuditView[],
    related: (relatedRes.data ?? []) as InvoiceRow[],
    downloadUrl: signed?.signedUrl ?? null,
  };
}

export async function getSettingsData(ctx: AppContext) {
  if (ctx.mode === "demo") {
    return {
      address: `${DEMO_ORG.inboxAlias}@example.invalid`,
      enabled: true,
      recent: [] as { status: string; created_at: string }[],
      configured: false,
    };
  }
  const [{ data: inbox }, { data: events }] = await Promise.all([
    ctx.db
      .from("invoice_inboxes")
      .select("email_alias, enabled")
      .eq("organization_id", ctx.org.id)
      .limit(1)
      .maybeSingle(),
    ctx.db
      .from("invoice_ingestion_events")
      .select("status, created_at")
      .eq("organization_id", ctx.org.id)
      .eq("provider", "resend")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return {
    address: inbox ? inboxAddress(inbox.email_alias as string) : "",
    enabled: (inbox?.enabled as boolean | undefined) ?? false,
    recent: (events ?? []) as { status: string; created_at: string }[],
    configured: !!(env.inboundDomain() && env.resendWebhookSecret() && env.resendApiKey()),
  };
}
