# EDGE SHARED HELPER KNOWLEDGE

## Scope
Applies to `supabase/functions/_shared`.

## Overview
Shared Deno helpers centralize Supabase admin access, Fortnox API calls, token refresh, retry/backoff, CORS, and sync job updates.

## Files
| File | Role |
|------|------|
| `supabase.ts` | Service-role Edge Function client helper. |
| `sync-helpers.ts` | Job updates, Fortnox token refresh, CORS, delay. |
| `fortnox-client.ts` | Fortnox API wrapper and retry/backoff behavior. |

## Conventions
- Keep helpers Deno-compatible; do not import Node/Next.js modules.
- Centralize Fortnox retries and rate-limit handling here before duplicating logic in sync steps.
- Use shared CORS headers and handle `OPTIONS` consistently in function entry points.
- Keep token refresh code compact and avoid logging access/refresh tokens.
- Use `as never` where Supabase generated types require it.

## Anti-Patterns
- Do not add step-specific mapping logic here unless multiple functions use it.
- Do not swallow sync job update failures silently without logging compact context.

## Verification
- For Fortnox retry/token changes, dry-run at least one sync step where feasible.
- For CORS changes, check `OPTIONS` handling in function entry points.
