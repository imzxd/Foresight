# Architecture

```
Supplier email ─▶ Resend inbound ─▶ POST /api/webhooks/resend
                                        │ verify Svix signature (raw body)
                                        │ resolve inbox alias → organization
                                        │ insert invoice_ingestion_events (unique key = idempotency)
                                        ▼
                                 Inngest: invoice/email.attachment
Manual upload ─▶ POST /api/invoices/upload        │ download attachment (Resend API)
 (auth; org from membership)           │          ▼
                                       └──▶ ingestDocument (stage A)
                                            size / %PDF check → SHA-256 → exact-duplicate check
                                            → private Storage → invoices(status = received)
                                            ▼
                                       processInvoice (stage B)
                                            page limit → local text (unpdf) → extractor (OpenAI: text
                                            first, file input only if scanned) → Zod → deterministic
                                            validation → potential-duplicate check →
                                            processed | needs_review | failed  (+ audit event)
                                            ▼
                                       recomputeInsights(org)   (SQL aggregates + pure rules)
                                            ▼
                         Overview / Invoices / Insights (server components, RLS-scoped client)
```

Upload runs stage B through Inngest when `INNGEST_EVENT_KEY` is set, otherwise inline (local dev).

## Layers

- `src/lib/invoices` – types, normalisation, validation, duplicates, pipeline, review (pure / interface-driven).
- `src/lib/analytics` – periods, aggregation, insight rules, overview, persistence (`recompute.ts`).
- `src/lib/forecast` – the single forecast calculation used by chart and KPIs.
- `src/lib/ai` – `InvoiceExtractor` implementations (OpenAI, mock) and local PDF inspection.
- `src/lib/db`, `email`, `jobs` – Supabase clients and store, Resend handling, Inngest functions.
- `src/lib/data/queries.ts` – page read models (live via RLS client, or fictional demo data).
- `src/app` – routes and server actions; `src/components` – UI.

## Data and security

Schema: `supabase/migrations`. RLS is enabled on every table; members may `select` their organization's
rows. Invoices, audit events, insights and ingestion events have **no** client write policies; the server
writes with the service role after resolving the organization from the caller's membership. The storage
bucket `invoices` is private; objects live under `<org_id>/`, reads require membership, and downloads use
2-minute signed URLs created after an RLS-checked lookup. Unique indexes prevent duplicate document hashes
and repeated provider deliveries. `tests/integration/rls.test.ts` applies the real migration to PGlite and
checks isolation from a user's perspective.

## Reporting rules

Only `processed` CAD invoices count. Months come from `invoice_date`; invoices without a valid date are
forced into review, so there is no fallback date. "Current month" uses the organization timezone and
comparisons use complete months only. Invoice totals are invoiced amounts, not payments.
