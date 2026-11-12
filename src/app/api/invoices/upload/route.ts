import { NextResponse } from "next/server";
import { getLiveContextOrNull } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/clients";
import { env, isLiveMode } from "@/lib/env";
import { DocumentRejectedError } from "@/lib/invoices/pdf";
import { ingestDocument } from "@/lib/invoices/pipeline";
import { dispatchProcessing } from "@/lib/jobs/inngest";
import { createLivePipelineDeps } from "@/lib/jobs/deps";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Manual PDF upload: a thin wrapper over the same pipeline used for emailed attachments. */
export async function POST(request: Request) {
  if (!isLiveMode()) {
    return NextResponse.json(
      { error: "Uploads are disabled in Demo Mode. Configure Supabase to enable them." },
      { status: 503 },
    );
  }
  const ctx = await getLiveContextOrNull();
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Attach a PDF file." }, { status: 400 });
  if (file.size > env.maxUploadBytes())
    return NextResponse.json(
      { error: `File exceeds the ${Math.round(env.maxUploadBytes() / 1048576)} MB limit.` },
      { status: 413 },
    );

  try {
    const deps = createLivePipelineDeps();
    const outcome = await ingestDocument(deps, {
      orgId: ctx.org.id,
      source: "manual_upload",
      filename: file.name || "invoice.pdf",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    if (outcome.kind === "duplicate")
      return NextResponse.json({
        outcome: "duplicate",
        invoiceId: outcome.invoice.id,
        message: "This exact document was already uploaded and was excluded from totals.",
      });
    if (outcome.kind === "existing")
      return NextResponse.json({
        outcome: "existing",
        invoiceId: outcome.invoice.id,
        message: "This document is already recorded.",
      });

    await createAdminClient().from("invoice_ingestion_events").insert({
      organization_id: ctx.org.id,
      provider: "manual_upload",
      external_event_id: outcome.invoice.id,
      attachment_id: "",
      status: "queued",
    });
    const mode = await dispatchProcessing(ctx.org.id, outcome.invoice.id);
    return NextResponse.json({
      outcome: "created",
      invoiceId: outcome.invoice.id,
      processing: mode,
    });
  } catch (e) {
    if (e instanceof DocumentRejectedError)
      return NextResponse.json({ error: e.message, code: e.code }, { status: 422 });
    console.error(
      JSON.stringify({
        app: "kime-foresight",
        event: "upload.error",
        error: e instanceof Error ? e.message : "unknown",
      }),
    );
    return NextResponse.json(
      {
        error: "Processing could not be started. Check AI extraction configuration and try again.",
      },
      { status: 500 },
    );
  }
}
