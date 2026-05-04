# SUPABASE APP CLIENT KNOWLEDGE

## Scope
Applies to `src/lib/supabase`.

## Overview
This directory separates Supabase client creation by runtime and privilege level.

## Client Split
| File | Runtime | Use |
|------|---------|-----|
| `client.ts` | Browser/client components | `createBrowserClient<Database>` with public env vars. |
| `server.ts` | Server components/routes | Async cookie-backed `createServerClient<Database>`. |
| `admin.ts` | Server-only privileged routes | Service-role client with non-persistent auth. |
| `middleware.ts` | Next middleware | Session refresh and login redirects. |

## Conventions
- Use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for anon clients.
- Use `SUPABASE_SERVICE_ROLE_KEY` only in server-only code.
- Keep `Database` generics on app Supabase clients.
- Server client creation is async because Next cookies are async.
- For insert/update/upsert calls, follow the existing `as never` convention where Supabase types require it.

## Security Rules
- Never import `admin.ts` from client components, hooks, or shared modules that can bundle client-side.
- Do not expose service-role errors, keys, or provider payload dumps in API responses.
- Prefer authenticated RLS-scoped clients unless a route has a documented admin/service-role reason.

## Verification
- For auth/session changes, check dashboard redirect behavior and API unauthorized behavior.
- For admin-client changes, run targeted route simulations and `pnpm build` when feasible.
