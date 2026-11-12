import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/invoices/types";

const MAP: Record<InvoiceStatus, ["neutral" | "good" | "warn" | "bad", string]> = {
  received: ["neutral", "Received"],
  processing: ["neutral", "Processing"],
  processed: ["good", "Processed"],
  needs_review: ["warn", "Needs review"],
  duplicate: ["neutral", "Duplicate"],
  failed: ["bad", "Failed"],
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const [tone, label] = MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const SOURCE_LABEL = { resend: "Email", manual_upload: "Upload" } as const;
