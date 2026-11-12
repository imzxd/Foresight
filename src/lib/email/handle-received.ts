import type { SupabaseClient } from "@supabase/supabase-js";
import { aliasFromRecipients, receivedEventSchema } from "./resend";

export type EnqueueData = {
  orgId: string;
  emailId: string;
  messageId: string | null;
  attachmentId: string;
  ingestionEventId: string;
};

export type ReceivedDeps = {
  db: SupabaseClient;
  enqueue: (data: EnqueueData) => Promise<unknown>;
  inboundDomain: string | undefined;
};

const isPdf = (a: { filename?: string | null; content_type?: string | null }) =>
  a.content_type?.toLowerCase() === "application/pdf" ||
  !!a.filename?.toLowerCase().endsWith(".pdf");

/**
 * Signature-verified `email.received` payload → ingestion events + queued jobs.
 * Idempotent: the (provider, external_event_id, attachment_id) unique key makes redelivery a no-op.
 */
export async function handleReceivedEmail(
  deps: ReceivedDeps,
  payload: unknown,
  deliveryId: string,
) {
  const parsed = receivedEventSchema.safeParse(payload);
  if (!parsed.success) return { status: 200, body: { ignored: "unsupported event" } }; // ack so Resend does not retry
  const { email_id, to, message_id, attachments } = parsed.data.data;

  const alias = aliasFromRecipients(to, deps.inboundDomain);
  if (!alias) return { status: 200, body: { ignored: "no matching recipient" } };
  const { data: inbox } = await deps.db
    .from("invoice_inboxes")
    .select("organization_id, enabled")
    .eq("email_alias", alias)
    .maybeSingle();
  if (!inbox || !inbox.enabled)
    return { status: 200, body: { ignored: "unknown or disabled inbox" } };
  const orgId = inbox.organization_id as string;

  const pdfs = attachments.filter(isPdf);
  if (pdfs.length === 0) return { status: 200, body: { ignored: "no PDF attachments" } };

  let queued = 0;
  let repeated = 0;
  for (const att of pdfs) {
    const { data: row, error } = await deps.db
      .from("invoice_ingestion_events")
      .insert({
        organization_id: orgId,
        provider: "resend",
        external_event_id: email_id,
        message_id: message_id ?? deliveryId,
        attachment_id: att.id,
        status: "received",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        repeated++;
        continue;
      }
      return { status: 500, body: { error: "could not record event" } }; // non-2xx → provider retries
    }
    await deps.enqueue({
      orgId,
      emailId: email_id,
      messageId: message_id ?? null,
      attachmentId: att.id,
      ingestionEventId: row.id as string,
    });
    await deps.db.from("invoice_ingestion_events").update({ status: "queued" }).eq("id", row.id);
    queued++;
  }
  return { status: 200, body: { queued, repeated } };
}
