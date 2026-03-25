# AGENTS

## Scope
This file applies to `supabase/functions` and nested function directories unless a deeper `AGENTS.md` overrides it.

## Purpose
- Edge functions implement sync pipelines between Fortnox and Supabase.
- Prioritize idempotent behavior, explicit progress reporting, and safe upsert/update semantics.

## Sync Pipeline Conventions
- Keep each sync function focused on one domain step (customers, employees, contracts, invoices, invoice rows, time reports, KPI generation).
- Maintain orchestration compatibility with step names expected by API/UI sync controls.
- Preserve partial-progress safety: failures should be diagnosable and re-runnable.

## Data Mapping Rules
- Use ex-VAT fields when available for turnover-related persistence (`total_ex_vat` conventions).
- Contract sync should only persist active contracts and normalize status consistently.
- Keep fallback handling explicit for missing fields from provider payloads.

## Supabase Usage
- Use shared client/helper patterns from `_shared` modules before adding new utilities.
- Follow existing repository convention for insert/update typing (`as never`) where required.
- Avoid schema assumptions that are not backed by migrations/types.

## Error Handling and Logging
- Include compact structured logs that identify sync step, page/chunk, and failing entity IDs.
- Never swallow errors silently; throw or return explicit failure payloads.
- Do not log secrets, tokens, or sensitive personal data.

## Verification
- Run diagnostics on modified function files.
- Execute targeted sync step tests or dry-run calls when behavior changes.
- Validate end-to-end typecheck/build when shared sync helpers or types are touched.
