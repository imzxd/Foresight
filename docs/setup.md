# Setup

## Local, Demo Mode

```bash
pnpm install
pnpm dev
```

No environment variables are needed. Uploads and edits are disabled and everything is labelled fictional.

## Live mode

### 1. Supabase

1. Create a project. Copy the project URL, anon key and service-role key into `.env.local`
   (see `.env.example`). The service-role key must never reach the browser or Git.
2. Apply the schema: `supabase db push` (Supabase CLI, linked to the project) or paste
   `supabase/migrations/20260101000000_init.sql` into the SQL editor.
3. Auth → Providers: keep Email enabled. For quick local testing you may disable "Confirm email".
4. The migration creates the private `invoices` storage bucket and its read policy.

### 2. OpenAI

Set `OPENAI_API_KEY`. `OPENAI_EXTRACTION_MODEL` defaults to `gpt-5-mini`; use any current model that
supports the Responses API, structured outputs and PDF file input.

### 3. Inngest (durable jobs)

- Local: `npx inngest-cli@latest dev` and set `INNGEST_EVENT_KEY=local` (any value) so uploads are queued
  instead of processed inline. Point the dev server at `http://localhost:3000/api/inngest`.
- Production: create an Inngest app, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`, and sync
  `https://<your-domain>/api/inngest`.

### 4. Resend inbound email

1. Choose an inbound domain, e.g. `in.yourdomain.com` → `INBOUND_EMAIL_DOMAIN`.
2. In Resend → Receiving, add that domain and create the DNS records Resend shows (an MX record pointing the
   subdomain at Resend, plus verification records). Use a dedicated subdomain so your normal mail is unaffected.
3. Create an API key → `RESEND_API_KEY`.
4. Add a webhook for the `email.received` event pointing at `https://<your-domain>/api/webhooks/resend`;
   copy its signing secret → `RESEND_WEBHOOK_SECRET`. For local testing expose your dev server with a tunnel.
5. Create an account in the app; Settings shows the address `inv-<random>@<INBOUND_EMAIL_DOMAIN>`.
6. Forward a PDF invoice to it. The attachment is fetched via the Resend receiving attachments API.

### 5. Optional demo data in a live workspace

`pnpm seed:demo -- <organization_id>` (add `--remove` to delete it later).

## Verification status

What has actually been run in this repository:

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit + integration), `pnpm build`, `pnpm test:e2e` (Demo Mode).
- RLS isolation: the real migration is executed on PGlite (in-process Postgres) with stand-ins for the
  Supabase `auth`/`storage` schemas.
- Webhook signature verification with real Svix signing; the pipeline with a mock extractor and in-memory store.

What has **not** been verified live (needs your credentials): Supabase Auth sign-up/sign-in flows,
Supabase Storage uploads and signed URLs, Resend inbound delivery and attachment download, Inngest
execution, and OpenAI extraction (text and scanned-PDF paths). Treat the first live run as a smoke test.
