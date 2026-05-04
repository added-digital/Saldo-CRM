# CONFIG KNOWLEDGE

## Scope
Applies to `src/config`.

## Overview
Configuration covers white-label identity, navigation, permission scopes, and translations.

## Files
| File | Role |
|------|------|
| `system.ts` | Company name, support metadata, logo/favicon paths. |
| `navigation.ts` | Sidebar sections, routes, icons, role/scope visibility. |
| `scopes.ts` | Scope definitions and scope key type. |
| `i18n.ts` | English/Swedish translation dictionaries. |

## Conventions
- Keep config client-safe; do not place secrets or service credentials here.
- Navigation labels should have corresponding translation keys where visible in the UI.
- Use `scope` for permission-gated features and `minRole` for role-gated sections.
- Keep icon imports from `lucide-react` typed as `LucideIcon`.
- White-label assets should point to `/public` paths such as `/brand/logo.svg`.

## I18n Rules
- Preserve both `en` and `sv` entries for user-visible copy.
- Keep keys stable when stored UI state or components depend on them.
- Add fallback strings at call sites using `useTranslation`.

## Anti-Patterns
- Do not hardcode tenant-specific secrets or deployment URLs in config.
- Do not add navigation routes without matching pages and permission expectations.
