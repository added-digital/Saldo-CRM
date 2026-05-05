# SUPABASE KNOWLEDGE

## Scope
Applies to `supabase` unless a deeper `AGENTS.md` overrides it.

## Overview
Supabase assets include ordered SQL migrations, seed data, local service config, Deno Edge Functions, and generated temp files.

## Structure
| Area | Role |
|------|------|
| `migrations` | Numeric schema/RLS/functions/storage/vector/mail/sync migrations. |
| `functions` | Deno Edge sync steps and shared Fortnox helpers. |
| `seed.sql` | Default seed data such as scopes. |
| `config.toml` | Local Supabase ports and Edge Function JWT settings. |

## Conventions
- Use `pnpm supabase db push` for local migration application per README/commands.
- Do not edit `.temp` files as source of truth.
- Keep migrations, app types, and Edge Function assumptions aligned.
- Service-role secrets belong in environment/vault configuration, not committed SQL or TypeScript.

## Data Rules
- RLS helpers include `get_user_role()` and `has_scope()`.
- Sync orchestration uses `sync_jobs`, `pg_net`, cron, and service-role function dispatch.
- Reporting/storage/document tables include pgvector and mail-related migrations in later numeric files.
- Ex-VAT and active-contract KPI rules apply across SQL and Edge Functions.

## Verification
- For schema/RLS changes, run database push locally when possible and inspect affected policies.
- For Edge Function changes, run targeted dry-run/sync-step checks where feasible.
