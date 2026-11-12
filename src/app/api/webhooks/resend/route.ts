import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/clients";
import { handleReceivedEmail } from "@/lib/email/handle-received";
import { InvalidSignatureError, verifyResendWebhook } from "@/lib/email/resend";
import { env } from "@/lib/env";
import { inngest } from "@/lib/jobs/inngest";

export const runtime = "nodejs";

/** Lightweight receiver: verify, record idempotently, enqueue. All heavy work happens in Inngest. */
export async function POST(request: Request) {
  const raw = await request.text(); // signature is computed over the raw body
  let payload: unknown;
  try {
    payload = verifyResendWebhook(raw, request.headers);
  } catch (e) {
    if (e instanceof InvalidSignatureError)
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const svixId = request.headers.get("svix-id") ?? "";
  const result = await handleReceivedEmail(
    {
      db: createAdminClient(),
      enqueue: (data) => inngest.send({ name: "invoice/email.attachment", data }),
      inboundDomain: env.inboundDomain(),
    },
    payload,
    svixId,
  );
  return NextResponse.json(result.body, { status: result.status });
}
