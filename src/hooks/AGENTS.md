# HOOK KNOWLEDGE

## Scope
Applies to `src/hooks`.

## Overview
Hooks provide dashboard providers, browser state, permissions, translation, cached data, media queries, and sync job actions.

## Where To Look
| Task | Location |
|------|----------|
| Profile/roles | `use-user.tsx` |
| Translations | `use-language.tsx`, `use-translation.ts` |
| Cached lists | `use-cached-data.ts` |
| Sync jobs | `use-sync.tsx` |
| Permissions | `use-scope.ts` |

## Conventions
- Add `"use client"` when a hook uses React client APIs, browser APIs, context, or Supabase browser clients.
- Guard `window`, `localStorage`, and media-query access so SSR/imports stay safe.
- Provider hooks such as `useUser`, `useLanguage`, and `useSync` should throw clearly when used outside their provider.
- Keep cache keys stable, namespaced, and user-scoped when data is user-specific.
- Keep visible UI copy compatible with `useTranslation` fallback usage.

## Data Rules
- `useUser` is the dashboard profile/role source.
- `useScope` gives admins an automatic pass and fetches user scopes client-side.
- `useCachedData` is stale-while-revalidate localStorage caching for small list pages.
- `useSync` creates queued `sync_jobs` and cleans stale processing jobs.

## Anti-Patterns
- Do not import service-role/admin Supabase clients from hooks.
- Do not hide required provider setup by returning silent null state from provider hooks.

## Verification
- For provider changes, verify mounted dashboard pages and outside-provider error paths.
- For browser storage changes, test first-load and corrupted-storage behavior.
