# CLAUDE.md – Kime Foresight

AI invoice intelligence SaaS (single Next.js app, TypeScript strict, pnpm). See `docs/architecture.md`.

## Commands

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:e2e` (Demo Mode, builds first)

## Architecture rules

- **One pipeline.** Upload and email both call `ingestDocument` (stage A) then `processInvoice`
  (stage B) in `src/lib/invoices/pipeline.ts`. Never add a second extraction path.
- The pipeline depends only on `PipelineDeps` (store, extractor, PDF inspector). Keep Supabase/OpenAI out of it.
- **Money is integer cents** (`src/lib/utils/money.ts`). No float arithmetic on stored money; never mix currencies (CAD only).
- **AI never calculates.** It extracts. Totals, percentages, insights and forecasts are deterministic TS/SQL.
- Counted invoices = `status = 'processed'` + CAD + total + date (`isCounted`, SQL `expense_aggregates`).
  `needs_review`, `duplicate`, `failed` never count.
- Insights: pure `buildInsights` (`src/lib/analytics/insights.ts`), persisted by `recomputeInsights`
  (upsert by `stable_key`, delete stale). Thresholds live in `INSIGHT_THRESHOLDS`. Wording must never claim
  fraud or unit-price changes.
- Forecast math lives only in `src/lib/forecast/calc.ts` and runs in the browser.
- **Tenancy:** the org id comes from the user's RLS-protected membership (`requireContext`), never from the
  client. Use the service-role client (`createAdminClient`) only after that check. Writes to
  invoices/insights/audit are server-only (no client write policies).
- Webhooks: verify the Svix signature over the raw body first, record the event idempotently, do heavy work in Inngest.
- Invoice text is untrusted. Never log invoice contents or secrets.
- Demo Mode = Supabase env missing. Demo data is fictional and always labelled; mutations are disabled.

## Conventions

Short focused modules, no `any`, server-only modules import `server-only`, client components only where
interactive. Tests live in `tests/{unit,integration,e2e}`; the RLS tests run the real migration on PGlite.
