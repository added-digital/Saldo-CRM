# VALIDATION KNOWLEDGE

## Scope
Applies to `src/lib/validations`.

## Overview
Validation modules define Zod schemas and inferred TypeScript types for API routes and dashboard forms.

## Where To Look
| Task | Location |
|------|----------|
| User/profile/team roles | `user.ts` |
| Team membership | `team.ts` |
| Customer forms | `customer.ts` |
| API examples | `src/app/api/users/invite/route.ts` |

## Conventions
- Use Zod v4 patterns already present in the directory.
- Export schemas as named constants and inferred types beside them.
- API routes should use `safeParse` and return structured field/input errors where useful.
- Forms should use `zodResolver` with these shared schemas when applicable.
- Keep empty-string optional handling explicit so form defaults and API payloads agree.

## Anti-Patterns
- Do not duplicate schema rules inside pages/routes when a shared schema exists.
- Do not broaden validation silently in API routes without checking dashboard form behavior.

## Verification
- For API schema changes, test invalid and valid payload shapes.
- For form schema changes, verify default values, empty strings, and displayed field errors.
