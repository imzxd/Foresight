import "server-only";

/**
 * Environment access. Nothing is read at import time so builds succeed without secrets.
 * "Live mode" requires Supabase; without it the app runs in clearly-labelled Demo Mode.
 */
const read = (name: string) => process.env[name]?.trim() || undefined;

export function isLiveMode(): boolean {
  return !!(
    read("NEXT_PUBLIC_SUPABASE_URL") &&
    read("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
    read("SUPABASE_SERVICE_ROLE_KEY")
  );
}

export const env = {
  supabaseUrl: () => read("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => read("SUPABASE_SERVICE_ROLE_KEY"),
  openaiKey: () => read("OPENAI_API_KEY"),
  openaiModel: () => read("OPENAI_EXTRACTION_MODEL") ?? "gpt-5-mini",
  resendApiKey: () => read("RESEND_API_KEY"),
  resendWebhookSecret: () => read("RESEND_WEBHOOK_SECRET"),
  inboundDomain: () => read("INBOUND_EMAIL_DOMAIN"),
  inngestEventKey: () => read("INNGEST_EVENT_KEY"),
  maxUploadBytes: () => Number(read("MAX_UPLOAD_BYTES") ?? 10 * 1024 * 1024),
  maxPages: () => Number(read("MAX_PDF_PAGES") ?? 20),
  /** When "mock", extraction uses the deterministic mock extractor (tests / e2e only). */
  extractorMode: () => read("EXTRACTOR_MODE"),
};

export function inboxAddress(alias: string): string {
  const domain = env.inboundDomain();
  return domain ? `${alias}@${domain}` : `${alias}@(set INBOUND_EMAIL_DOMAIN)`;
}
