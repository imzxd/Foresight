# Kime Foresight

**From invoices to insights. Automatically.**
AI-powered invoice intelligence and expense forecasting for small businesses.

Businesses get a private invoice-receiving email address. PDF invoices sent or forwarded to it are
verified, stored privately, extracted into structured fields, validated by deterministic rules,
categorised, and turned into a financial dashboard with proactive insights and a what-if
**Forecast Studio**.

> Operational invoice intelligence, not accounting or financial advice.

## Features

1. **Automated invoice processing** – Resend inbound email → verified webhook → durable Inngest job →
   PDF checks, SHA-256 fingerprint, duplicate detection, AI extraction (Zod-validated), deterministic
   validation, human-review queue with audit history. Manual PDF upload (a secondary fallback) uses the
   _same_ pipeline.
2. **Proactive financial insights** – category and supplier month-over-month changes, unusually large
   invoices (vs. the median of the previous five from that supplier), possible-duplicate alerts, and
   explicit "not enough history" messages. All numbers come from SQL/TypeScript; no AI maths.
3. **Analytics & Forecast Studio** (supporting) – KPI cards, trend/category/supplier charts, and a
   browser-only compounding scenario simulator (`baseline × (1 + rate)^m`).

Demo Mode (no credentials needed) runs the full UI on clearly labelled fictional data.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Radix/shadcn-style UI ·
Recharts · Supabase (Postgres, Auth, Storage, RLS) · Inngest · Resend inbound · OpenAI Responses API
(behind a provider-agnostic interface) · Zod · Vitest · Playwright · pnpm.

## Quick start (Demo Mode)

```bash
pnpm install
pnpm dev          # http://localhost:3000 – no env vars needed
```

Live mode: see [docs/setup.md](docs/setup.md).

## Commands

| Command                        | Purpose                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit`                                                 |
| `pnpm test`                    | Vitest unit + integration (includes real-Postgres RLS tests via PGlite) |
| `pnpm build`                   | Production build                                                        |
| `pnpm test:e2e`                | Playwright on the production build in Demo Mode (desktop + mobile)      |
| `pnpm seed:demo -- <org_id>`   | Load fictional invoices into a live organization                        |

## Architecture

See [docs/architecture.md](docs/architecture.md) and [docs/decisions.md](docs/decisions.md). One
Next.js app; pure domain logic in `src/lib/{invoices,analytics,forecast}`; infrastructure (Supabase,
Resend, Inngest, OpenAI) sits behind small interfaces so the pipeline is testable with an in-memory
store and a mock extractor.

## Environment variables

Documented in [.env.example](.env.example). Without the three Supabase variables the app runs in Demo
Mode.

## Deployment

[docs/deployment.md](docs/deployment.md) (Vercel + Supabase + Resend + Inngest).

## Known limitations

- **Live integrations are untested against real services.** Supabase Auth/Storage, Resend, Inngest and
  OpenAI code paths follow current documentation and are tested with mocks and an in-process Postgres
  only. See [Verification status](docs/setup.md#verification-status).
- Reporting currency is CAD only; invoices in other currencies go to review and are never converted.
- Owner role only; one workspace per user.
- Totals are _invoiced_ amounts, not payments or cash flow.
- No upload rate limiting beyond size/page limits; no email notifications.
- Database types are hand-written (`src/lib/invoices/types.ts`), not generated.
- Scanned-PDF extraction uses OpenAI file input and has not been exercised against real scans.
- The Playwright suite covers Demo Mode; the authenticated upload → approve journey is covered at the
  pipeline level (integration tests) but not in a browser.
