# Saldo CRM

A **white-label internal operations system** — a stripped-down CRM focused on what companies actually need. Built as a reusable template for rapid deployment.

## Quick Start

```bash
pnpm install
cp .env.example .env.local
# Fill in your Supabase, Resend, and Fortnox credentials
pnpm dev
```

## Deploy for a New Company

1. Clone this repository
2. Update branding in `src/config/system.ts` (company name, logo paths, URLs)
3. Update colors and fonts in `src/styles/theme.css`
4. Place logo files in `public/brand/`
5. Create a Supabase project and configure environment variables
6. Configure Resend SMTP in Supabase Dashboard → Authentication → SMTP Settings
7. Run database migrations: `pnpm supabase db push`
8. Deploy to Vercel
9. Create your first admin user (see below)
10. Connect Fortnox via Settings → Integrations

## Creating the First Admin

After deploying, sign in with your email (magic link). Then promote yourself to admin:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'david@added.digital';
```

Run this in the Supabase SQL Editor or via `supabase` CLI.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Backend/DB | Supabase (PostgreSQL, Auth, RLS) |
| Email | Resend |
| UI | shadcn/ui + Radix UI |
| Styling | Tailwind CSS 4 |
| Animations | GSAP |
| Deployment | Vercel |

## Project Structure

```
src/
├── app/                    # Next.js routes
│   ├── (auth)/             # Login, auth callbacks
│   ├── (dashboard)/        # Authenticated pages
│   └── api/                # API routes (Fortnox, email)
├── components/
│   ├── ui/                 # shadcn/ui primitives (do not modify)
│   ├── app/                # App-level component compositions
│   └── layout/             # Sidebar, topbar, breadcrumbs
├── config/                 # System variables, navigation, scopes
├── hooks/                  # React hooks
├── lib/                    # Supabase, Fortnox, Resend, validations
├── emails/                 # React Email templates
├── styles/                 # Theme CSS variables
└── types/                  # TypeScript type definitions
```

## White-Label Customization

### Branding

Edit `src/config/system.ts`:
- Company name, short name, description
- Support email, company details
- Logo and favicon paths

### Colors & Theme

Edit `src/styles/theme.css`:
- All colors use CSS custom properties with oklch color space
- Change `--color-brand-primary` and friends to match your brand
- shadcn/ui components automatically pick up changes via the variable bridge

### Navigation

Edit `src/config/navigation.ts` to add, remove, or reorder sidebar items.

### Permissions

Add new scopes by inserting rows into the `scopes` table. Then reference them in navigation config.

## Environment Variables

See `.env.example` for all required variables. Key services:

- **Supabase**: URL, anon key, service role key
- **Resend**: API key (also configured as SMTP in Supabase)
- **Fortnox**: Client ID, secret, redirect URI
- **App**: Public URL

## Database

Migrations are in `supabase/migrations/`. Run them with:

```bash
pnpm supabase db push
```

Seed data (default scopes) is in `supabase/seed.sql`.

## Development

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # Run ESLint
```
