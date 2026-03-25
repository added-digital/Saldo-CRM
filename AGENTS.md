# AGENTS

## Scope
This file applies to the entire repository unless a deeper `AGENTS.md` overrides it.

## Product Context
- Saldo CRM built with Next.js App Router + Supabase.
- Main domains: dashboard reporting, customer/contract data, sync pipelines, and operational settings.

## Global Engineering Rules
- Use TypeScript and keep type safety strict. Do not use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Prefer named exports in all files except `page.tsx` and `layout.tsx` where default export is expected.
- Keep comments minimal and only when logic is non-obvious.
- Follow existing UI patterns and component primitives in `src/components` before creating new abstractions.
- Client-visible environment variables must use `NEXT_PUBLIC_` prefix.

## Next.js + Supabase Conventions
- Next.js route params in pages/layouts should follow async params shape used in this codebase.
- Use async server Supabase client creators and sync client-side creators according to existing utility split.
- For Supabase insert/update calls, follow existing project convention where `as never` is required.

## Data and Reporting Conventions
- Turnover values should use ex-VAT source (`total_ex_vat`) when available.
- Contract totals/KPIs should be based on active contracts only.
- Use consistent language in UI labels: "cost center" (not contributor).

## Delivery Expectations
- Match existing formatting and naming styles in touched modules.
- After edits, run targeted verification: diagnostics for modified files, relevant tests, then project typecheck/build when applicable.
- Never commit or push unless explicitly requested.
