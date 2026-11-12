"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  markDuplicateAction,
  retryProcessingAction,
  reviewInvoiceAction,
  type ReviewActionResult,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { CorrectionInput } from "@/lib/invoices/review";
import { CATEGORIES, type InvoiceRow } from "@/lib/invoices/types";
import { centsToInputValue } from "@/lib/utils/money";

const money = (c: number | null) => (c === null ? "" : centsToInputValue(c));

export function ReviewForm({
  invoice,
  readOnlyReason,
}: {
  invoice: InvoiceRow;
  readOnlyReason?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<CorrectionInput>({
    supplier_name: invoice.supplier_name ?? "",
    invoice_number: invoice.invoice_number ?? "",
    invoice_date: invoice.invoice_date ?? "",
    due_date: invoice.due_date ?? "",
    subtotal: money(invoice.subtotal_cents),
    tax: money(invoice.tax_cents),
    total: money(invoice.total_cents),
    currency: invoice.currency ?? "",
    category: invoice.category ?? "",
  });
  const [problems, setProblems] = useState<string[]>([]);

  const locked =
    !!readOnlyReason ||
    invoice.status === "duplicate" ||
    invoice.status === "received" ||
    invoice.status === "processing";
  const set = (k: keyof CorrectionInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function run(fn: () => Promise<ReviewActionResult>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setProblems([]);
        toast.success(res.message ?? "Done.");
        router.refresh();
      } else {
        setProblems(res.issues?.filter((i) => i.severity === "error").map((i) => i.message) ?? []);
        toast.error(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4" aria-label="Invoice details">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="supplier">
          <Input
            id="supplier"
            value={form.supplier_name}
            onChange={set("supplier_name")}
            disabled={locked}
          />
        </Field>
        <Field label="Invoice number" htmlFor="number">
          <Input
            id="number"
            value={form.invoice_number}
            onChange={set("invoice_number")}
            disabled={locked}
          />
        </Field>
        <Field label="Invoice date" htmlFor="idate" hint="YYYY-MM-DD">
          <Input
            id="idate"
            value={form.invoice_date}
            onChange={set("invoice_date")}
            placeholder="2026-05-14"
            disabled={locked}
          />
        </Field>
        <Field label="Due date" htmlFor="ddate" hint="Optional">
          <Input
            id="ddate"
            value={form.due_date}
            onChange={set("due_date")}
            placeholder="2026-06-13"
            disabled={locked}
          />
        </Field>
        <Field label="Subtotal" htmlFor="subtotal">
          <Input
            id="subtotal"
            inputMode="decimal"
            value={form.subtotal}
            onChange={set("subtotal")}
            disabled={locked}
          />
        </Field>
        <Field label="Tax" htmlFor="tax">
          <Input
            id="tax"
            inputMode="decimal"
            value={form.tax}
            onChange={set("tax")}
            disabled={locked}
          />
        </Field>
        <Field label="Total" htmlFor="total">
          <Input
            id="total"
            inputMode="decimal"
            value={form.total}
            onChange={set("total")}
            disabled={locked}
          />
        </Field>
        <Field label="Currency" htmlFor="currency" hint="Only CAD is supported for reporting.">
          <Input
            id="currency"
            maxLength={3}
            value={form.currency}
            onChange={set("currency")}
            disabled={locked}
          />
        </Field>
        <Field label="Category" htmlFor="category">
          <Select id="category" value={form.category} onChange={set("category")} disabled={locked}>
            <option value="">Select…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {problems.length > 0 && (
        <ul
          role="alert"
          className="list-disc rounded-lg bg-danger-soft py-3 pl-8 pr-4 text-sm text-danger"
        >
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {readOnlyReason && <p className="text-sm text-muted">{readOnlyReason}</p>}

      {!locked && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => reviewInvoiceAction(invoice.id, form, "approve"))}
          >
            Approve
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => reviewInvoiceAction(invoice.id, form, "save"))}
          >
            Save corrections
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => run(() => markDuplicateAction(invoice.id))}
          >
            Mark as duplicate
          </Button>
        </div>
      )}
      {invoice.status === "failed" && !readOnlyReason && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => retryProcessingAction(invoice.id))}
        >
          Retry automatic extraction
        </Button>
      )}
    </form>
  );
}
