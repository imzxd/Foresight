import "server-only";
import { MockInvoiceExtractor } from "@/lib/ai/mock-extractor";
import { OpenAIInvoiceExtractor } from "@/lib/ai/openai-extractor";
import { inspectPdf } from "@/lib/ai/pdf-inspect";
import { recomputeInsights } from "@/lib/analytics/recompute";
import { createAdminClient } from "@/lib/db/clients";
import { createSupabaseStore } from "@/lib/db/store";
import { env } from "@/lib/env";
import type { InvoiceExtractor } from "@/lib/invoices/extraction-schema";
import type { PipelineDeps } from "@/lib/invoices/pipeline";

function createExtractor(): InvoiceExtractor {
  if (env.extractorMode() === "mock") return new MockInvoiceExtractor();
  const apiKey = env.openaiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAIInvoiceExtractor({ apiKey, model: env.openaiModel() });
}

/** Privacy-safe operational log: event name + counters only, never document contents. */
const log = (event: string, data: Record<string, unknown>) =>
  console.info(JSON.stringify({ app: "kime-foresight", event, ...data }));

export function createLivePipelineDeps(): PipelineDeps {
  const db = createAdminClient();
  return {
    store: createSupabaseStore(db),
    // Created lazily so ingestion works (and fails clearly) even if the AI key is absent.
    extractor: { extract: (input) => createExtractor().extract(input) },
    inspectPdf,
    onInvoicesChanged: (orgId) => recomputeInsights(db, orgId),
    limits: { maxBytes: env.maxUploadBytes(), maxPages: env.maxPages() },
    log,
  };
}
