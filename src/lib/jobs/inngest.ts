import "server-only";
import { Inngest } from "inngest";
import { downloadReceivedAttachment } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/db/clients";
import { env } from "@/lib/env";
import { DocumentRejectedError } from "@/lib/invoices/pdf";
import { ingestDocument, processInvoice } from "@/lib/invoices/pipeline";
import { createLivePipelineDeps } from "./deps";

export const inngest = new Inngest({ id: "kime-foresight" });

export type Events = {
  "invoice/email.attachment": {
    orgId: string;
    emailId: string;
    messageId: string | null;
    attachmentId: string;
    ingestionEventId: string;
  };
  "invoice/process": { orgId: string; invoiceId: string };
};

async function setIngestionStatus(id: string, status: string, detail?: string) {
  await createAdminClient()
    .from("invoice_ingestion_events")
    .update({ status, detail: detail ?? null, processed_at: new Date().toISOString() })
    .eq("id", id);
}

/** Emailed attachment: fetch, then run the SAME ingest + process stages as manual uploads. */
export const processEmailAttachment = inngest.createFunction(
  { id: "process-email-attachment", retries: 3, concurrency: { limit: 3 } },
  { event: "invoice/email.attachment" },
  async ({ event, step }) => {
    const { orgId, emailId, messageId, attachmentId, ingestionEventId } =
      event.data as Events["invoice/email.attachment"];

    const ingest = await step.run("fetch-and-ingest", async () => {
      try {
        const { bytes, filename } = await downloadReceivedAttachment(
          emailId,
          attachmentId,
          env.maxUploadBytes(),
        );
        const outcome = await ingestDocument(createLivePipelineDeps(), {
          orgId,
          source: "resend",
          filename,
          bytes,
          messageId,
          attachmentId,
        });
        if (outcome.kind !== "created") await setIngestionStatus(ingestionEventId, "duplicate");
        return { invoiceId: outcome.kind === "created" ? outcome.invoice.id : null };
      } catch (e) {
        if (e instanceof DocumentRejectedError) {
          await setIngestionStatus(ingestionEventId, "rejected", e.code);
          return { invoiceId: null };
        }
        throw e; // transient: let Inngest retry with backoff
      }
    });
    if (!ingest.invoiceId) return { skipped: true };

    const invoice = await step.run("extract-and-save", () =>
      processInvoice(createLivePipelineDeps(), orgId, ingest.invoiceId!),
    );
    await step.run("mark-ingestion", () =>
      setIngestionStatus(ingestionEventId, invoice.status === "failed" ? "failed" : "processed"),
    );
    return { invoiceId: invoice.id, status: invoice.status };
  },
);

/** Manual upload (or retry): stored document already exists; just extract. */
export const processStoredInvoice = inngest.createFunction(
  { id: "process-stored-invoice", retries: 2, concurrency: { limit: 3 } },
  { event: "invoice/process" },
  async ({ event, step }) => {
    const { orgId, invoiceId } = event.data as Events["invoice/process"];
    const invoice = await step.run("extract-and-save", () =>
      processInvoice(createLivePipelineDeps(), orgId, invoiceId),
    );
    return { invoiceId, status: invoice.status };
  },
);

export const functions = [processEmailAttachment, processStoredInvoice];

/** Queue processing durably when Inngest is configured; otherwise run inline (local development). */
export async function dispatchProcessing(
  orgId: string,
  invoiceId: string,
): Promise<"queued" | "inline"> {
  if (env.inngestEventKey()) {
    await inngest.send({ name: "invoice/process", data: { orgId, invoiceId } });
    return "queued";
  }
  await processInvoice(createLivePipelineDeps(), orgId, invoiceId);
  return "inline";
}
