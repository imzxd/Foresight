# Deployment (Vercel + Supabase + Resend + Inngest)

Nothing has been deployed from this repository; these are the steps to do so.

1. **Supabase**: create the project and apply the migration (see `docs/setup.md`).
2. **Vercel**: import the repository (framework: Next.js, package manager: pnpm). Add environment variables
   from `.env.example` for Production (Supabase keys, OpenAI, Resend, Inngest, `INBOUND_EMAIL_DOMAIN`).
   Do not set `EXTRACTOR_MODE`.
3. **Inngest**: install the Vercel integration or set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`, then sync
   `https://<domain>/api/inngest`.
4. **Resend**: verify the inbound domain DNS, point the `email.received` webhook at
   `https://<domain>/api/webhooks/resend`, and set the signing secret.
5. **Supabase Auth**: set the Site URL and redirect URLs to the production domain.
6. Smoke test: sign up, create a workspace, upload a PDF on Invoices, then forward a PDF to the inbox address.

Notes: the upload route and webhook use the Node.js runtime. Function duration is set for the upload route
(`maxDuration = 60`) so inline processing works without Inngest on plans that allow it; production should
use Inngest.
