import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { monthLabel } from "@/lib/analytics/periods";
import type { InsightView } from "@/lib/data/queries";
import { formatCentsRounded } from "@/lib/utils/money";

const SEVERITY = {
  info: ["neutral", "Info"],
  warning: ["warn", "Review"],
  critical: ["bad", "Critical"],
} as const;

function evidenceFigures(e: Record<string, unknown>): { label: string; value: string }[] {
  const n = (k: string) => (typeof e[k] === "number" ? (e[k] as number) : null);
  const out: { label: string; value: string }[] = [];
  const prev = n("previousCents");
  const cur = n("currentCents");
  if (prev !== null && cur !== null) {
    out.push({
      label: typeof e.previousMonth === "string" ? monthLabel(e.previousMonth) : "Previous",
      value: formatCentsRounded(prev),
    });
    out.push({
      label: typeof e.currentMonth === "string" ? monthLabel(e.currentMonth) : "Current",
      value: formatCentsRounded(cur),
    });
  }
  const invoice = n("invoiceTotalCents");
  const median = n("medianPriorCents");
  if (invoice !== null && median !== null) {
    out.push({ label: "This invoice", value: formatCentsRounded(invoice) });
    out.push({
      label: `Median of prior ${n("priorInvoiceCount") ?? ""}`.trim(),
      value: formatCentsRounded(median),
    });
  }
  const total = n("totalCents");
  if (total !== null && invoice === null)
    out.push({ label: "Invoice total", value: formatCentsRounded(total) });
  return out;
}

export function InsightCard({
  insight,
  showDate = false,
}: {
  insight: InsightView;
  showDate?: boolean;
}) {
  const [tone, label] = SEVERITY[insight.severity];
  const figures = evidenceFigures(insight.evidence);
  const entity = (insight.evidence.supplier ?? insight.evidence.category) as string | undefined;
  const period =
    insight.reporting_period && /^\d{4}-\d{2}$/.test(insight.reporting_period)
      ? monthLabel(insight.reporting_period)
      : null;
  const related = insight.related_invoice_ids ?? [];

  return (
    <Card className="p-5" aria-labelledby={`insight-${insight.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
        {entity && <Badge>{entity}</Badge>}
        {period && <span className="text-xs text-muted">Period: {period}</span>}
        {showDate && (
          <span className="ml-auto text-xs text-muted">
            Updated {new Date(insight.computed_at).toLocaleDateString("en-CA")}
          </span>
        )}
      </div>
      <h3 id={`insight-${insight.id}`} className="mt-2.5 text-base font-semibold">
        {insight.title}
      </h3>
      <p className="mt-1 text-sm text-muted">{insight.body}</p>
      {figures.length > 0 && (
        <dl className="num mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {figures.map((f) => (
            <div key={f.label}>
              <dt className="inline text-muted">{f.label}: </dt>
              <dd className="inline font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <p>
          <span className="text-muted">Suggested next step: </span>
          {insight.evidence.suggestedAction}
        </p>
        {related.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {related.slice(0, 3).map((id, i) => (
              <Link
                key={id}
                href={`/invoices/${id}`}
                className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
              >
                Invoice {i + 1} <ArrowRight className="h-3 w-3" />
              </Link>
            ))}
            {related.length > 3 && (
              <span className="text-xs text-muted">+{related.length - 3} more</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
