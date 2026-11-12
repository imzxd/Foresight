import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/invoices/review-form";
import { StatusBadge, SOURCE_LABEL } from "@/components/invoices/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { requireContext } from "@/lib/auth/session";
import { getInvoiceDetail } from "@/lib/data/queries";
import { formatCents } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{8,40}$|^demo-[\w-]+$/i;

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireContext();
  const detail = await getInvoiceDetail(ctx, id);
  if (!detail) notFound();
  const { invoice, audit, related, downloadUrl } = detail;

  return (
    <div className="space-y-5">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> All invoices
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {invoice.supplier_name ?? invoice.original_filename}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={invoice.status} />
            <span>{SOURCE_LABEL[invoice.source]}</span>
            <span>·</span>
            <span>{invoice.original_filename}</span>
            {invoice.total_cents !== null && (
              <span className="num font-medium text-ink">
                · {formatCents(invoice.total_cents, invoice.currency ?? "CAD")}
              </span>
            )}
          </p>
        </div>
        {downloadUrl && (
          <Button asChild variant="outline">
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> View original PDF
            </a>
          </Button>
        )}
      </div>

      {invoice.validation_results.length > 0 && (
        <Card className="border-warn/30">
          <CardHeader
            title="Checks that need attention"
            description="Records with errors stay out of expense totals until approved."
          />
          <ul className="space-y-2 px-5 py-4 text-sm">
            {invoice.validation_results.map((v, i) => (
              <li key={`${v.code}-${i}`} className="flex items-start gap-2">
                <Badge tone={v.severity === "error" ? "bad" : "warn"}>{v.severity}</Badge>
                <span>
                  {v.message}{" "}
                  {v.relatedInvoiceId && (
                    <Link
                      className="font-medium text-accent hover:underline"
                      href={`/invoices/${v.relatedInvoiceId}`}
                    >
                      View related invoice
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Extracted details"
          description="Review, correct and approve. Only processed invoices count in analytics."
        />
        <div className="p-5">
          <ReviewForm
            invoice={invoice}
            readOnlyReason={ctx.mode === "demo" ? "Editing is disabled in Demo Mode." : undefined}
          />
        </div>
      </Card>

      {related.length > 0 && (
        <Card>
          <CardHeader title="Related invoices" />
          <ul className="divide-y divide-line text-sm">
            {related.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link
                  href={`/invoices/${r.id}`}
                  className="font-medium hover:text-accent hover:underline"
                >
                  {r.supplier_name} · {r.invoice_number}
                </Link>
                <span className="num text-muted">
                  {r.invoice_date} · {r.total_cents === null ? "—" : formatCents(r.total_cents)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Audit history" />
        {audit.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No recorded changes.</p>
        ) : (
          <ol className="divide-y divide-line text-sm">
            {audit.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <p>
                  <span className="font-medium">{a.action.replaceAll("_", " ")}</span>{" "}
                  <span className="text-muted">
                    by {a.actor} · {new Date(a.created_at).toLocaleString("en-CA")}
                  </span>
                </p>
                {Object.keys(a.changed_fields).length > 0 && (
                  <pre className="num mt-1 overflow-x-auto rounded bg-canvas p-2 text-xs text-muted">
                    {JSON.stringify(a.changed_fields, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
