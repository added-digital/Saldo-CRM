# COMPONENT KNOWLEDGE

## Scope
Applies to `src/components` unless a deeper `AGENTS.md` overrides it.

## Overview
Component code is layered: `ui` primitives, `app` CRM compositions, and `layout` dashboard shell/navigation.

## Structure
| Area | Role |
|------|------|
| `ui` | shadcn/Radix primitive wrappers. |
| `app` | CRM-specific reusable compositions such as tables, headers, KPIs, empty/loading states. |
| `layout` | Dashboard frame, sidebar, topbar, breadcrumbs, provider shell. |

## Conventions
- Use named exports.
- Use `cn()` for class merging.
- Preserve native/Radix prop passthrough with `React.ComponentProps` where primitives wrap elements.
- Mark `"use client"` only when hooks, browser APIs, Radix behavior, or state require it.
- Use Lucide icons sized with `className` utilities such as `size-4`.

## UI Layer Rules
- Treat `src/components/ui` as the shadcn/Radix primitive layer; avoid page-specific behavior there.
- Put CRM behavior in `src/components/app` rather than modifying primitives for one use case.
- Keep dashboard frame concerns in `src/components/layout`.
- Direct Radix imports should usually stay in `ui` wrappers.
- Preserve `data-slot` and variant patterns in primitive components.

## App Component Rules
- Reuse `DataTable`, `PageHeader`, `EmptyState`, `LoadingState`, `StatusBadge`, `KpiCards`, `ActionBar`, and dialog components before creating new patterns.
- Keep shared components generic enough for more than one page.
- Do not bury page-specific Supabase queries inside shared components.
- Keep translation-dependent visible copy compatible with `useTranslation` fallback usage.

## Anti-Patterns
- Do not bypass `src/components/app` by duplicating table/header/loading/empty-state patterns in pages.
- Do not add arbitrary visual styles that conflict with the compact dark dashboard system.
- Do not mutate shadcn primitives to satisfy a single page.
