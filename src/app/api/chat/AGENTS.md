# CHAT API KNOWLEDGE

## Scope
Applies to `src/app/api/chat`.

## Overview
The chat API runs Anthropic tool-calling over CRM/reporting/document data and returns dashboard-compatible answers, sources, and tool traces.

## Where To Look
| Task | Location |
|------|----------|
| Route loop | `route.ts` |
| System prompt | `prompt.ts` |
| Tool schemas/dispatch | `tools/index.ts` |
| Tool context | `tools/types.ts` |

## Route Rules
- `route.ts` uses `runtime = "nodejs"`.
- Load the authenticated user with the server Supabase client and require a profile before tool use.
- Preserve response shape: `conversation_id`, `answer`, `sources`, `tool_calls`.
- The route reads conversation history when `conversation_id` is supplied but does not persist conversations server-side.
- Keep tool iteration and token limits explicit.

## Prompt And Tool Rules
- Keep prompt guidance aligned with actual tool behavior.
- Prefer customer resolution before customer-scoped tools.
- Prefer `customer_kpis`/KPI tools for totals and rankings; raw invoice search is for listing individual invoices.
- Consultant ownership maps through Fortnox cost centers.
- Do not expose UUIDs or internal IDs unless the user explicitly needs them.

## Security
- Do not log full model/provider payloads, tokens, or sensitive personal data.
- Keep document source output compact and user-safe.

## Verification
- Simulate missing API key, unauthorized user, invalid body, and at least one tool-backed answer when changing route behavior.
