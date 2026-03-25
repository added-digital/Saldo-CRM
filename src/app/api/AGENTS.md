# AGENTS

## Scope
This file applies to `src/app/api` and all nested route handlers unless a deeper `AGENTS.md` overrides it.

## Purpose
- API routes in this project coordinate CRM operations, sync triggers, mail sending, and debug/admin workflows.
- Optimize for predictable request validation, stable response shapes, and actionable error messages.

## Route Handler Conventions
- Use explicit request parsing and validate required fields early.
- Return structured JSON responses with clear success/error semantics.
- Keep status codes aligned with outcome (`2xx` success, `4xx` client input, `5xx` server/runtime issues).
- Avoid leaking secrets or full provider payloads in responses.

## Data and Integration Rules
- Preserve reporting conventions in API outputs (ex-VAT turnover preference where relevant).
- For Fortnox-related APIs, keep behavior aligned with active-contract filtering policy.
- Keep compatibility with existing frontend consumers; avoid breaking response keys without coordinated updates.

## Security and Reliability
- Never expose service-role credentials in client-visible routes.
- Sanitize and normalize user-provided strings before downstream provider calls.
- Log concise diagnostic context useful for debugging without dumping sensitive content.

## Style and Structure
- Keep route logic focused; extract shared helpers when the same pattern appears across routes.
- Prefer named exports in helper modules; route files follow Next.js route conventions.
- Keep comments minimal and only for non-obvious logic.

## Verification
- Run diagnostics for modified route files.
- Execute targeted API tests or request simulations when touching parsing or response contracts.
- Run project typecheck/build if shared types or cross-route behavior changed.
