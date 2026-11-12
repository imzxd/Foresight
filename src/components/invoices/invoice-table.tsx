import Link from "next/link";
import type { InvoiceListItem } from "@/lib/data/queries";
import { formatCents } from "@/lib/utils/money";
import { SOURCE_LABEL, StatusBadge } from "./status-badge";

export function InvoiceTable({
  items,
  compact = false,
}: {
  items: InvoiceListItem[];
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th scope="col" className="px-5 py-2.5 font-medium">
              Supplier
            </th>
            {!compact && (
              <th scope="col" className="px-3 py-2.5 font-medium">
                Invoice #
              </th>
            )}
            <th scope="col" className="px-3 py-2.5 font-medium">
              Date
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Category
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Total
            </th>
            {!compact && (
              <th scope="col" className="px-3 py-2.5 font-medium">
                Source
              </th>
            )}
            <th scope="col" className="px-5 py-2.5 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="num">
          {items.map((i) => (
            <tr key={i.id} className="border-b border-line last:border-0 hover:bg-canvas">
              <td className="px-5 py-3 font-medium">
                <Link href={`/invoices/${i.id}`} className="hover:text-accent hover:underline">
                  {i.supplier_name ?? <span className="text-muted">{i.original_filename}</span>}
                </Link>
              </td>
              {!compact && <td className="px-3 py-3 text-muted">{i.invoice_number ?? "—"}</td>}
              <td className="px-3 py-3 text-muted">{i.invoice_date ?? "—"}</td>
              <td className="px-3 py-3 text-muted">{i.category ?? "—"}</td>
              <td className="px-3 py-3 text-right">
                {i.total_cents === null ? "—" : formatCents(i.total_cents, i.currency ?? "CAD")}
              </td>
              {!compact && <td className="px-3 py-3 text-muted">{SOURCE_LABEL[i.source]}</td>}
              <td className="px-5 py-3">
                <StatusBadge status={i.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
