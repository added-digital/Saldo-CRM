# SHARED LIB KNOWLEDGE

## Scope
Applies to `src/lib` unless a deeper `AGENTS.md` overrides it.

## Overview
`src/lib` owns reusable application logic: Supabase clients, Fortnox helpers, reporting utilities, validation schemas, sync constants, and general utilities.

## Where To Look
| Task | Location | Notes |
|------|----------|-------|
| Class names/helpers | `utils.ts` | `cn()`, dates, initials, labels, status colors. |
| Supabase clients | `supabase/` | Browser/server/admin split has deeper guidance. |
| Reporting | `reports/` | Types, windows, ex-VAT turnover, hours, accruals. |
| Validations | `validations/` | Zod schemas and inferred form/API types. |
| Fortnox app runtime | `fortnox/` | OAuth/API helpers for Next.js routes. |
| Nightly sync | `sync/nightly.ts` | Step labels, chain id, cron authorization. |

## Conventions
- Prefer named exports and `@/*` imports.
- Keep shared helpers runtime-safe; do not import browser APIs unless the module is explicitly client-only.
- Do not import service-role clients into client-reachable modules.
- Use strict types and avoid `as any`, `@ts-ignore`, and `@ts-expect-error`.
- Extract repeated page/route logic here when it is not tightly tied to one route.

## Data Rules
- Reporting helpers should preserve ex-VAT and active-contract conventions.
- Fortnox ownership mapping commonly uses `fortnox_cost_center` strings.
- Shared helpers should not silently change dashboard/API response semantics.

## Anti-Patterns
- Do not create catch-all utility modules for domain-specific logic that belongs under `reports`, `fortnox`, `supabase`, or `validations`.
- Do not mix Deno Edge Function helpers into `src/lib`; Edge shared code lives under `supabase/functions/_shared`.
