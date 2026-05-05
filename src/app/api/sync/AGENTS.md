# SYNC API KNOWLEDGE

## Scope
Applies to `src/app/api/sync`.

## Overview
Sync APIs enqueue and orchestrate sync jobs; Supabase Edge Functions execute domain sync steps.

## Where To Look
| Task | Location |
|------|----------|
| Manual step enqueue | `[step]/route.ts` |
| Nightly trigger | `nightly/route.ts` |
| Client queue creation | `src/hooks/use-sync.tsx` |
| Edge execution | `supabase/functions/sync-*` |

## Step Rules
- Keep step names compatible with UI hooks, database dispatch, and Edge Function names.
- Current step family includes customers, employees, invoices, invoice rows, articles, time reports, contracts, and KPI generation.
- Preserve `sync_jobs` fields: `status`, `progress`, `current_step`, `step_name`, `payload`, `batch_phase`, `batch_offset`, and `dispatch_lock`.

## Access Rules
- Sync triggers are admin-oriented unless a route explicitly documents narrower access.
- Use server/admin Supabase clients only in server routes.
- Do not expose service-role keys or raw Edge Function errors to clients.

## Reliability
- Enqueue work idempotently enough for retries.
- Keep stale-job cleanup behavior compatible with `useSync`.
- Return stable JSON status/error shapes for settings/sync UI consumers.

## Verification
- Simulate allowed and forbidden users for trigger routes.
- Confirm queued rows match Edge Function expectations before changing step names.
