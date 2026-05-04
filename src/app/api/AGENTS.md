# API ROUTE KNOWLEDGE

## Scope
This file applies to `src/app/api` and all nested route handlers unless a deeper `AGENTS.md` overrides it.

## Purpose
- API routes in this project coordinate CRM operations, sync triggers, mail sending, and debug/admin workflows.
- Optimize for predictable request validation, stable response shapes, and actionable error messages.

## Entry Points
- General routes are `route.ts` files under `src/app/api/**` with named HTTP exports.
- AI/document-heavy routes use `export const runtime = "nodejs"` when parser/provider packages need Node runtime.
- Chat tools live under `src/app/api/chat/tools`; generated-SQL/RAG routes live under `src/app/api/questions`.
- Sync trigger APIs enqueue `sync_jobs`; Supabase Edge Functions process the actual sync steps.

## Route Handler Conventions
- Use explicit request parsing and validate required fields early.
- Return structured JSON responses with clear success/error semantics.
- Keep status codes aligned with outcome (`2xx` success, `4xx` client input, `5xx` server/runtime issues).
- Avoid leaking secrets or full provider payloads in responses.

## Data and Integration Rules
- Preserve reporting conventions in API outputs (ex-VAT turnover preference where relevant).
- For Fortnox-related APIs, keep behavior aligned with active-contract filtering policy.
- Keep compatibility with existing frontend consumers; avoid breaking response keys without coordinated updates.
- For KPI/total questions, prefer `customer_kpis` or reporting rollups over raw invoice rows.
- Customer-to-consultant ownership often uses `fortnox_cost_center` string matching.

## Security and Reliability
- Never expose service-role credentials in client-visible routes.
- Sanitize and normalize user-provided strings before downstream provider calls.
- Log concise diagnostic context useful for debugging without dumping sensitive content.
- Admin/service-role clients are allowed only for documented server-side admin, document, sync, invite, or generated-SQL/RPC flows.
- Treat Fortnox, Microsoft Graph, Anthropic, Voyage, and Supabase provider payloads as sensitive by default.

## Style and Structure
- Keep route logic focused; extract shared helpers when the same pattern appears across routes.
- Prefer named exports in helper modules; route files follow Next.js route conventions.
- Keep comments minimal and only for non-obvious logic.
- Preserve stable response keys for existing UI consumers, especially chat/mail/document routes.
- Avoid adding new large route files; colocate private route helpers only for single-route behavior or move reusable logic to `src/lib`.

## Verification
- Run diagnostics for modified route files.
- Execute targeted API tests or request simulations when touching parsing or response contracts.
- Run project typecheck/build if shared types or cross-route behavior changed.
