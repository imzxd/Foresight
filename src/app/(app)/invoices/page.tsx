import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { UploadButton } from "@/components/invoices/upload-button";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { requireContext } from "@/lib/auth/session";
import { listInvoices, PAGE_SIZE } from "@/lib/data/queries";
import { CATEGORIES, INVOICE_STATUSES } from "@/lib/invoices/types";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string; category?: string; page?: string };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const status = INVOICE_STATUSES.find((s) => s === sp.status);
  const category = CATEGORIES.find((c) => c === sp.category);
  const { items, total, page } = await listInvoices(ctx, {
    q: sp.q,
    status,
    category,
    page: Number(sp.page) || 1,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/invoices${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted">
            Invoices arrive automatically by email. Manual upload is a fallback for testing and
            one-off documents.
          </p>
        </div>
        <UploadButton
          disabled={ctx.mode === "demo"}
          disabledReason="Uploads are disabled in Demo Mode."
        />
      </div>

      <form
        method="get"
        className="flex flex-wrap gap-2"
        role="search"
        aria-label="Filter invoices"
      >
        <Input
          name="q"
          defaultValue={sp.q}
          placeholder="Search supplier or invoice number"
          aria-label="Search"
          className="w-full sm:w-72"
        />
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="w-auto">
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </Select>
        <Select
          name="category"
          defaultValue={category ?? ""}
          aria-label="Category"
          className="w-auto"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        {(sp.q || status || category) && (
          <Button asChild variant="ghost">
            <Link href="/invoices">Clear</Link>
          </Button>
        )}
      </form>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title={
              sp.q || status || category ? "No invoices match these filters" : "No invoices yet"
            }
          >
            {sp.q || status || category
              ? "Try clearing the filters."
              : "Forward a supplier PDF to your invoice inbox address (Settings) and it will appear here."}
          </EmptyState>
        ) : (
          <InvoiceTable items={items} />
        )}
      </Card>

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {page} of {pages} · {total} invoices
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={href(page - 1)}>Previous</Link>
              </Button>
            )}
            {page < pages && (
              <Button asChild variant="outline" size="sm">
                <Link href={href(page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
