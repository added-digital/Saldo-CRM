# DASHBOARD SETTINGS KNOWLEDGE

## Scope
Applies to `src/app/(dashboard)/settings`.

## Overview
Settings pages manage profile, users, teams, integrations, files, contacts, segments, mail templates, and sync controls.

## Where To Look
| Task | Location |
|------|----------|
| Settings tabs | `layout.tsx` |
| Files/documents | `files/page.tsx` plus `src/app/api/documents` |
| Integrations/sync | `integrations/page.tsx`, `sync/page.tsx`, `src/app/api/sync` |
| Teams/users | `teams/`, `users/page.tsx`, validation schemas |

## Conventions
- Most settings pages are client components using `useUser`, `useTranslation`, Supabase browser client, and `sonner` toasts.
- Hide admin-only tabs/workflows from non-admin users rather than showing unusable controls.
- Team detail has a special permission path: team leads may manage their own team where existing code allows it.
- Use existing cards/forms/dialogs/tables; do not create one-off settings UI primitives.
- Keep user-facing copy translated with fallback strings.

## Data Rules
- Settings mutations commonly use Supabase `as never` payload typing.
- File settings interact with storage/document APIs; keep storage paths and document metadata aligned.
- Integrations/sync settings must stay compatible with sync step names and `sync_jobs` queue fields.

## Security
- Do not expose service-role details, OAuth tokens, storage credentials, or full provider payloads in UI errors.

## Verification
- Check admin and non-admin visibility when changing settings navigation.
- For sync/integration changes, verify queued job shape and settings UI feedback.
