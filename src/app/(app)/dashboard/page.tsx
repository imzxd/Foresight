import type { Metadata } from "next";
import Link from "next/link";
import {
  CategoryChart,
  MonthlyTrendChart,
  SupplierChart,
} from "@/components/dashboard/charts-lazy";
import { Kpi } from "@/components/dashboard/kpi";
import { ForecastStudio } from "@/components/forecast/forecast-studio";
import { InsightCard } from "@/components/insights/insight-card";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { requireContext } from "@/lib/auth/session";
import { getOverviewData } from "@/lib/data/queries";
import { formatCentsRounded } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const { overview, reviewCount, recent, insights } = await getOverviewData(ctx);
  const change = overview.periodChange;
  const empty = overview.invoiceCount === 0;

  const baselineNote = `Mean of the last ${overview.baselineMonths} complete months of processed invoices.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ctx.org.name}</h1>
          <p className="text-sm text-muted">
            Expense overview from invoices received by email. Amounts in CAD.
          </p>
        </div>
        <ForecastStudio
          defaultBaselineCents={overview.baselineCents}
          baselineNote={baselineNote}
          isDemo={ctx.mode === "demo"}
        />
      </div>

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Recorded invoice expenses"
          value={formatCentsRounded(overview.totalCents)}
          note="Processed invoices, last 12+ months"
        />
        <Kpi
          label="Invoices processed"
          value={String(overview.invoiceCount)}
          note="Counted in totals"
        />
        <Kpi
          label="Awaiting review"
          value={String(reviewCount)}
          note={reviewCount ? "Excluded until approved" : "Nothing pending"}
          href={reviewCount ? "/invoices?status=needs_review" : undefined}
          tone={reviewCount ? "warn" : undefined}
        />
        <Kpi
          label="Change vs previous month"
          value={
            change?.changePct == null
              ? "—"
              : `${change.changePct >= 0 ? "+" : "−"}${Math.abs(change.changePct).toFixed(1)}%`
          }
          note={
            change
              ? `${change.latestLabel} vs ${change.previousLabel}`
              : "Needs two complete months of data"
          }
        />
      </section>

      {empty ? (
        <Card>
          <EmptyState title="No processed invoices yet">
            Forward a supplier PDF to your invoice inbox address (see Settings) or upload one on the
            Invoices page. Charts appear once invoices are processed.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Monthly expenses"
              description="Recorded invoiced expenses by invoice date. * marks the month in progress."
            />
            <div className="p-4">
              <MonthlyTrendChart data={overview.monthly} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Expenses by category" />
            <div className="p-4">
              <CategoryChart data={overview.categories} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Top suppliers" description="Largest recorded invoice totals" />
            <div className="p-4">
              <SupplierChart data={overview.suppliers} />
            </div>
          </Card>
        </div>
      )}

      <section aria-labelledby="insights-h" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="insights-h" className="text-base font-semibold">
            Automated insights
          </h2>
          <Link href="/insights" className="text-sm font-medium text-accent hover:underline">
            View all
          </Link>
        </div>
        {insights.length === 0 ? (
          <Card>
            <EmptyState title="No insights yet">
              Insights are generated automatically as invoices are processed.
            </EmptyState>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader
          title="Recent invoices"
          action={
            <Link href="/invoices" className="text-sm font-medium text-accent hover:underline">
              All invoices
            </Link>
          }
        />
        {recent.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <InvoiceTable items={recent} compact />
        )}
      </Card>
    </div>
  );
}
