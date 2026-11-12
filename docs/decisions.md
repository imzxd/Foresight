# Decision log

| #   | Decision                                                                | Why                                                                                                 |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Single Next.js app, no separate backend                                 | Lowest operating cost and complexity.                                                               |
| 2   | Pipeline split into ingest (A) + process (B) behind `PipelineDeps`      | Shared by upload and email; testable with in-memory store; retries only repeat cheap work.          |
| 3   | `processed` status = counted (valid or human-approved)                  | One flag for analytics; approval is recorded in the audit log.                                      |
| 4   | Local text extraction first (unpdf); file input only for scanned PDFs   | Cuts model cost; one model call per invoice.                                                        |
| 5   | Insights persisted with `stable_key` upsert + stale delete              | No duplicate or stale cards; dashboards do not recompute.                                           |
| 6   | Dashboard totals via SQL `expense_aggregates` (grouped, 13 months)      | Avoids shipping raw rows to the app.                                                                |
| 7   | CAD only; other currencies go to review                                 | Never mix or convert currencies.                                                                    |
| 8   | Writes via service role after RLS membership check                      | Clients cannot forge financial records.                                                             |
| 9   | Demo Mode when Supabase env is missing                                  | Runnable and honest; no fake "live" claims.                                                         |
| 10  | Hand-written shadcn-style primitives (Radix + cva)                      | Avoids the interactive CLI; same conventions.                                                       |
| 11  | TypeScript 5.9, ESLint 9, Inngest 3, OpenAI SDK 5                       | Newer majors exist (TS 7, ESLint 10, Inngest 4, OpenAI 7) but were not evaluated for compatibility. |
| 12  | `src/proxy.ts` refreshes sessions (Next 16 replacement for middleware)  | Required by the framework version.                                                                  |
| 13  | Large invoice: ≥3 prior invoices, ≥2× median of prior ≤5, ≥ $100 excess | Transparent, low false-positive rule; never labelled fraud.                                         |
| 14  | Movements need ≥10%, ≥ $50 change and ≥ $50 baseline                    | Suppresses noise from tiny numbers.                                                                 |
| 15  | Default model `gpt-5-mini` via `OPENAI_EXTRACTION_MODEL`                | Economical default, **unverified against the live API**; change via env if unavailable.             |
