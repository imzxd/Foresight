import "server-only";
import { Webhook } from "svix";
import { z } from "zod";
import { env } from "@/lib/env";

/** Subset of the Resend `email.received` webhook we rely on. */
export const receivedEventSchema = z.object({
  type: z.literal("email.received"),
  data: z.object({
    email_id: z.string(),
    to: z.array(z.string()).default([]),
    message_id: z.string().optional(),
    attachments: z
      .array(
        z.object({
          id: z.string(),
          filename: z.string().nullish(),
          content_type: z.string().nullish(),
          size: z.number().nullish(),
        }),
      )
      .default([]),
  }),
});
export type ReceivedEvent = z.infer<typeof receivedEventSchema>;

export class InvalidSignatureError extends Error {}

/** Verifies the Svix signature against the RAW request body. Throws InvalidSignatureError on failure. */
export function verifyResendWebhook(rawBody: string, headers: Headers): unknown {
  const secret = env.resendWebhookSecret();
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET is not configured");
  try {
    new Webhook(secret).verify(rawBody, {
      "svix-id": headers.get("svix-id") ?? "",
      "svix-timestamp": headers.get("svix-timestamp") ?? "",
      "svix-signature": headers.get("svix-signature") ?? "",
    });
    // Parse only after the signature over the raw bytes has been verified.
    return JSON.parse(rawBody);
  } catch {
    throw new InvalidSignatureError("Invalid webhook signature");
  }
}

/** Extracts the inbox alias from recipient addresses on our inbound domain. */
export function aliasFromRecipients(
  recipients: string[],
  domain: string | undefined,
): string | null {
  for (const raw of recipients) {
    const m = raw.match(/<?([^<>\s]+)@([^<>\s]+?)>?$/);
    if (!m) continue;
    if (domain && m[2]!.toLowerCase() !== domain.toLowerCase()) continue;
    return m[1]!.toLowerCase();
  }
  return null;
}

type AttachmentListItem = {
  id: string;
  filename?: string;
  content_type?: string;
  download_url?: string;
};

/** Downloads one attachment through the Resend receiving API (short-lived download URLs). */
export async function downloadReceivedAttachment(
  emailId: string,
  attachmentId: string,
  maxBytes: number,
) {
  const key = env.resendApiKey();
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  const res = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) throw new Error(`Resend attachment list failed (${res.status})`);
  const body = (await res.json()) as { data?: AttachmentListItem[] };
  const item = body.data?.find((a) => a.id === attachmentId);
  if (!item?.download_url) throw new Error("Attachment not found or has no download URL");
  const file = await fetch(item.download_url, { signal: AbortSignal.timeout(30_000) });
  if (!file.ok) throw new Error(`Attachment download failed (${file.status})`);
  const declared = Number(file.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("Attachment exceeds size limit");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes, filename: item.filename ?? "invoice.pdf" };
}
