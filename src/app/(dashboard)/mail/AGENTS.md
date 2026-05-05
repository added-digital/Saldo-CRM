# DASHBOARD MAIL KNOWLEDGE

## Scope
Applies to `src/app/(dashboard)/mail`.

## Overview
Mail pages handle recipient selection, templates, preview/send flows, OAuth reauth recovery, send batches, and history.

## Where To Look
| Task | Location |
|------|----------|
| Composer | `page.tsx` |
| History | `history/page.tsx` |
| Send API | `src/app/api/email/route.ts` |
| Template settings | `src/app/(dashboard)/settings/mail/page.tsx` |

## Conventions
- Preserve one user send action mapping to one `/api/email` request and one `mail_send_batches` row with related `sent_emails`.
- Keep per-recipient personalization behavior stable.
- Preserve draft snapshot/restore behavior around Microsoft reauth.
- Keep history filters/status labels compatible with existing send status values.
- Use existing shared table, dialog, button, empty/loading, and translation patterns.

## Security
- Treat recipient lists, rendered email bodies, Microsoft OAuth state, and Graph errors as sensitive.
- Do not log full email content, recipient batches, OAuth tokens, or Graph provider payloads.

## Verification
- For mail composer changes, simulate preview, reauth return, send, and history rendering paths where feasible.
- For API contract changes, verify both legacy payload compatibility and current dashboard payloads.
- For template changes, check composer preview and settings/mail CRUD behavior.
