import type { Metadata } from "next";
import { InsightCard } from "@/components/insights/insight-card";
import { Card, EmptyState } from "@/components/ui/card";
import { requireContext } from "@/lib/auth/session";
import { getInsights } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const ctx = await requireContext();
  const insights = await getInsights(ctx);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-sm text-muted">
          Calculated automatically from processed invoices using fixed rules (no AI estimates).
          Month comparisons use complete months only. Unusual invoices are prompts to check, not
          conclusions.
        </p>
      </div>
      {insights.length === 0 ? (
        <Card>
          <EmptyState title="No insights yet">
            They appear automatically as invoices are processed and approved.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3">
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} showDate />
          ))}
        </div>
      )}
    </div>
  );
}
