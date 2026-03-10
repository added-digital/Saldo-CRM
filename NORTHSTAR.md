# NORTHSTAR.md

> **This document is the single source of truth for all development decisions.**
> Every feature, pattern, and architectural choice references this file.
> If it's not in NORTHSTAR, it doesn't exist yet.

---

## 1. Project Identity

### What We're Building

A **white-label internal operations system** for companies. A stripped-down CRM focused on what companies actually need — no bloat, no unused features. Every deployment is a single-tenant instance customized via configuration variables.

### Template Philosophy

This project is a **reusable template**. To deploy for a new company:

1. Clone the repository
2. Update system variables (colors, fonts, company name, logo)
3. Run SQL migrations
4. Configure environment variables (Supabase, Fortnox, Resend)
5. Deploy

The system should be production-ready for a new client within hours, not weeks.

### Single-Tenant Architecture

- One deployment = one company
- No tenant isolation logic in the database
- Simpler RLS policies (no `tenant_id` columns)
- Template is cloned and deployed per client

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.x | Full-stack React framework |
| Language | TypeScript | 5.x | Type safety everywhere |
| Backend/DB | Supabase | Latest | PostgreSQL, Auth, Realtime, Storage |
| Email | Resend | Latest | Transactional emails + Supabase SMTP |
| UI Primitives | shadcn/ui + Radix UI | Latest | Accessible, composable component primitives |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| Animations | GSAP | 3.x | Page transitions, micro-interactions |
| Deployment | Vercel | - | Hosting, edge functions |
| Package Manager | pnpm | Latest | Fast, disk-efficient |

### shadcn/ui Strategy

shadcn/ui is **not a dependency** — it copies component source code into the project (`src/components/ui/`). This is critical for the white-label template: we own every line, and theme variables cascade through automatically.

**Rules:**
1. **Install only what you need** — Don't bulk-install. Pull components as features require them.
2. **Never modify shadcn primitives directly** — If you need custom behavior, wrap them in app-level components (see Section 9).
3. **Theme integration** — shadcn/ui uses CSS variables by default. Our `theme.css` variables are the single source of truth — shadcn components consume them via Tailwind mappings.
4. **Lucide icons** — shadcn/ui uses Lucide React. This is our sole icon library. No mixing icon sets.

### Key Dependencies

```
next
react / react-dom
@supabase/supabase-js
@supabase/ssr
resend
@react-email/components
tailwindcss
gsap
lucide-react              # Icon library (used by shadcn/ui)
@radix-ui/*               # Installed per-component by shadcn/ui CLI
class-variance-authority   # Variant management (shadcn/ui dependency)
clsx                      # Class merging utility
tailwind-merge            # Tailwind class deduplication
zod                       # Schema validation (v4 — import from "zod/v4")
sonner                    # Toast notifications (shadcn/ui compatible)
@tanstack/react-table     # Table primitives (used by shadcn DataTable)
react-hook-form           # Form state management
@hookform/resolvers       # Zod resolver for react-hook-form
supabase                  # Supabase CLI (devDependency — for migrations)
```

### Next.js 16 Specifics

- **Page params are async**: `export default async function Page({ params }: { params: Promise<{ id: string }> })` — must `await params`
- **Middleware deprecated**: The `middleware.ts` file convention still works but shows a deprecation warning suggesting `proxy.ts`. We continue using `middleware.ts` for now.
- **Server `createClient` is async**: `const supabase = await createClient()` because `cookies()` is async in Next.js 16

---

## 3. System Variables & White-Label Configuration

All customizable values live in a single configuration file: `src/config/system.ts`.

### 3.1 Brand Variables

```typescript
// src/config/system.ts
export const system = {
  // Identity
  name: "Company System",            // Displayed in sidebar, login page, emails
  shortName: "CS",                    // Favicon, collapsed sidebar
  description: "Internal operations system",
  url: "https://system.company.com",

  // Contact
  supportEmail: "support@company.com",
  companyName: "Company AB",
  companyOrgNr: "556xxx-xxxx",       // Swedish org number

  // Assets (paths relative to /public)
  logo: "/brand/logo.svg",
  logoMark: "/brand/logo-mark.svg",  // Icon-only version
  favicon: "/brand/favicon.ico",
} as const
```

### 3.2 Theme Variables

All colors are defined as CSS custom properties in `src/styles/theme.css` and consumed via Tailwind.

```css
/* src/styles/theme.css */
:root {
  /* ─── Brand Colors ─── */
  --color-brand-primary: oklch(0.55 0.15 250);
  --color-brand-primary-hover: oklch(0.48 0.15 250);
  --color-brand-primary-subtle: oklch(0.95 0.03 250);

  --color-brand-secondary: oklch(0.65 0.10 160);
  --color-brand-secondary-hover: oklch(0.58 0.10 160);

  /* ─── Semantic Colors ─── */
  --color-success: oklch(0.65 0.15 145);
  --color-warning: oklch(0.75 0.15 80);
  --color-error: oklch(0.55 0.2 25);
  --color-info: oklch(0.60 0.15 250);

  /* ─── Surface Colors ─── */
  --color-bg-primary: oklch(1.0 0 0);
  --color-bg-secondary: oklch(0.97 0 0);
  --color-bg-tertiary: oklch(0.94 0 0);
  --color-bg-inverse: oklch(0.15 0 0);

  /* ─── Text Colors ─── */
  --color-text-primary: oklch(0.15 0 0);
  --color-text-secondary: oklch(0.45 0 0);
  --color-text-tertiary: oklch(0.60 0 0);
  --color-text-on-brand: oklch(1.0 0 0);
  --color-text-on-inverse: oklch(0.95 0 0);

  /* ─── Border Colors ─── */
  --color-border-default: oklch(0.90 0 0);
  --color-border-strong: oklch(0.80 0 0);
  --color-border-brand: var(--color-brand-primary);

  /* ─── Shadows ─── */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.08);
  --shadow-lg: 0 10px 25px -3px oklch(0 0 0 / 0.10);

  /* ─── Radius ─── */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* ─── Spacing Scale (used for consistent layout) ─── */
  --space-page-x: 1.5rem;     /* Horizontal page padding */
  --space-page-y: 1.5rem;     /* Vertical page padding */
  --space-section-gap: 2rem;   /* Gap between page sections */
  --space-card-padding: 1.5rem;

  /* ─── Sidebar ─── */
  --sidebar-width: 16rem;
  --sidebar-width-collapsed: 4.5rem;

  /* ─── Transitions ─── */
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --easing-default: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Dark mode override (future-ready) */
[data-theme="dark"] {
  --color-bg-primary: oklch(0.13 0 0);
  --color-bg-secondary: oklch(0.17 0 0);
  --color-bg-tertiary: oklch(0.21 0 0);
  --color-bg-inverse: oklch(0.95 0 0);

  --color-text-primary: oklch(0.93 0 0);
  --color-text-secondary: oklch(0.70 0 0);
  --color-text-tertiary: oklch(0.55 0 0);
  --color-text-on-inverse: oklch(0.13 0 0);

  --color-border-default: oklch(0.25 0 0);
  --color-border-strong: oklch(0.35 0 0);
}
```

### 3.3 Typography Variables

```css
/* Inside src/styles/theme.css */
:root {
  /* ─── Font Families ─── */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;

  /* ─── Font Sizes (modular scale) ─── */
  --text-xs: 0.75rem;       /* 12px */
  --text-sm: 0.875rem;      /* 14px */
  --text-base: 1rem;        /* 16px */
  --text-lg: 1.125rem;      /* 18px */
  --text-xl: 1.25rem;       /* 20px */
  --text-2xl: 1.5rem;       /* 24px */
  --text-3xl: 1.875rem;     /* 30px */

  /* ─── Font Weights ─── */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* ─── Line Heights ─── */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
}
```

### 3.4 Tailwind Integration

Tailwind CSS 4 does **not** use `tailwind.config.ts`. Instead, CSS custom properties are registered directly in `globals.css` via `@theme inline` blocks, making them available as Tailwind utility classes:

```css
/* src/app/globals.css */
@import "tailwindcss";
@import "shadcn/tailwind.css";
@import "tw-animate-css";
@import "../styles/theme.css";

@theme inline {
  --color-brand-primary: var(--color-brand-primary);
  --color-brand-primary-hover: var(--color-brand-primary-hover);
  /* ... all theme variables mapped here */
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);
}
```

**Usage in components** (same as before — Tailwind auto-generates utilities from `@theme inline` vars):

```tsx
<button className="bg-brand-primary text-content-on-brand hover:bg-brand-primary-hover rounded-md shadow-sm">
  Save
</button>

<div className="bg-surface-secondary border border-border rounded-lg p-6">
  <p className="text-content-primary">Title</p>
  <p className="text-content-secondary">Description</p>
</div>
```

---

## 4. Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth layout group (no sidebar)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── auth/
│   │   │   ├── callback/
│   │   │   │   └── page.tsx      # Client-side auth callback (handles hash fragments, PKCE, and token_hash)
│   │   │   └── confirm/
│   │   │       └── route.ts      # Email confirmation handler
│   │   └── layout.tsx            # Centered, minimal layout
│   ├── (dashboard)/              # Authenticated layout group
│   │   ├── layout.tsx            # Sidebar + topbar + main content
│   │   ├── page.tsx              # Dashboard home
│   │   ├── customers/
│   │   │   ├── page.tsx          # Customer list
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Customer detail
│   │   ├── teams/
│   │   │   ├── page.tsx          # Team list
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Team detail
│   │   ├── users/
│   │   │   └── page.tsx          # User management (admin)
│   │   └── settings/
│   │       ├── page.tsx          # General settings
│   │       ├── profile/
│   │       │   └── page.tsx      # User profile
│   │       └── integrations/
│   │           └── page.tsx      # Fortnox connection settings
│   └── api/                      # API routes
│       ├── fortnox/
│       │   ├── auth/
│       │   │   └── route.ts      # Fortnox OAuth callback
│       │   ├── sync/
│       │   │   └── route.ts      # Manual sync trigger
│       │   └── webhook/
│       │       └── route.ts      # Fortnox websocket event handler
│       ├── email/
│       │   └── route.ts          # Resend email sending
│       └── users/
│           └── invite/
│               └── route.ts      # User invitation (admin, uses service role)
├── components/
│   ├── ui/                       # Layer 1: shadcn/ui primitives (installed via CLI)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── dialog.tsx
│   │   ├── alert-dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── badge.tsx
│   │   ├── avatar.tsx
│   │   ├── card.tsx
│   │   ├── table.tsx
│   │   ├── skeleton.tsx
│   │   ├── tooltip.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── command.tsx
│   │   ├── popover.tsx
│   │   ├── checkbox.tsx
│   │   ├── switch.tsx
│   │   ├── tabs.tsx
│   │   ├── textarea.tsx
│   │   ├── form.tsx
│   │   └── sonner.tsx
│   ├── app/                      # Layer 2: App-level compositions
│   │   ├── icon-wrapper.tsx
│   │   ├── nav-link.tsx
│   │   ├── form-field.tsx
│   │   ├── search-input.tsx
│   │   ├── form-actions.tsx
│   │   ├── confirm-dialog.tsx
│   │   ├── data-table.tsx
│   │   ├── data-table-toolbar.tsx
│   │   ├── empty-state.tsx
│   │   ├── loading-state.tsx
│   │   ├── page-header.tsx
│   │   ├── status-badge.tsx
│   │   └── user-avatar.tsx
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── sidebar-nav.tsx
│   │   ├── topbar.tsx
│   │   ├── breadcrumbs.tsx
│   │   └── page-header.tsx
│   ├── forms/
│   │   ├── form-field.tsx        # Label + input + error wrapper
│   │   ├── search-input.tsx
│   │   └── form-actions.tsx      # Save/Cancel button row
│   └── data/
│       ├── data-table.tsx        # Sortable, filterable table
│       ├── empty-state.tsx       # No data placeholder
│       └── loading-state.tsx     # Skeleton loading
├── config/
│   ├── system.ts                 # Brand, company, identity variables
│   ├── navigation.ts            # Sidebar navigation definition
│   └── scopes.ts                # Feature scope definitions
├── hooks/
│   ├── use-user.ts              # Current user + role
│   ├── use-scope.ts             # Permission checking
│   ├── use-debounce.ts
│   └── use-media-query.ts
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # Browser client
│   │   ├── server.ts            # Server client (RSC / Route Handlers)
│   │   ├── middleware.ts         # Auth middleware helper
│   │   └── admin.ts             # Service role client (migrations, admin ops)
│   ├── fortnox/
│   │   ├── client.ts            # Fortnox API client
│   │   ├── auth.ts              # OAuth token management
│   │   ├── sync.ts              # Sync logic (customers)
│   │   └── websocket.ts         # Websocket connection handler
│   ├── resend/
│   │   └── client.ts            # Resend email client
│   ├── validations/
│   │   ├── user.ts              # User schemas (Zod)
│   │   ├── customer.ts          # Customer schemas
│   │   └── team.ts              # Team schemas
│   └── utils.ts                 # cn() (clsx + tailwind-merge), formatDate(), etc.
├── emails/                       # React Email templates (separate from shadcn)
│   ├── magic-link.tsx
│   ├── welcome.tsx
│   ├── team-invite.tsx
│   └── layout.tsx               # Shared email layout
├── styles/
│   ├── globals.css              # Tailwind directives + base styles
│   └── theme.css                # CSS custom properties (all variables)
├── types/
│   ├── database.ts              # Generated Supabase types
│   ├── fortnox.ts               # Fortnox API response types
│   └── index.ts                 # Shared app types
└── middleware.ts                 # Auth guard + redirect logic

components.json                    # shadcn/ui configuration
supabase/
├── config.toml                  # Supabase local config
├── migrations/
│   ├── 00001_auth_schema.sql    # Profiles, roles, teams
│   ├── 00002_scopes.sql         # Scope/permission tables
│   ├── 00003_customers.sql      # Customer table + Fortnox sync
│   ├── 00004_rls_policies.sql   # All RLS policies
│   └── 00005_functions.sql      # Database functions + triggers
└── seed.sql                     # Default admin user, base scopes
```

---

## 5. Authentication

### 5.1 Magic Link Flow

Authentication is **passwordless** via Supabase magic links.

**Flow:**
1. User enters email on `/login`
2. System calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`
3. Supabase sends magic link via Resend SMTP
4. User clicks link → redirected to `/auth/callback`
5. Client-side callback page handles three auth token delivery methods:
   - **Hash fragment** (invites): `#access_token=...&refresh_token=...` → `supabase.auth.setSession()`
   - **PKCE code** (magic links): `?code=...` → `supabase.auth.exchangeCodeForSession()`
   - **Token hash** (legacy/confirm): `?token_hash=...&type=...` → `supabase.auth.verifyOtp()`
6. User redirected to `/` (dashboard)

> **Note:** The callback is a **client-side page** (`page.tsx`), not a server route (`route.ts`). This is required because Supabase `inviteUserByEmail()` delivers tokens via URL hash fragments (`#access_token=...`), which are invisible to server-side route handlers. The page is wrapped in `<Suspense>` for `useSearchParams()` compatibility.

**Resend as Supabase SMTP provider:**

| Setting | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` |
| Password | Resend API key |
| Sender email | Configured per deployment |
| Sender name | From `system.name` |

This is configured in Supabase Dashboard → Authentication → SMTP Settings.

### 5.2 Session Management

- Sessions managed by `@supabase/ssr` with cookie-based auth
- Middleware (`src/middleware.ts`) refreshes session on every request
- Unauthenticated users are redirected to `/login`
- Authenticated users accessing `/login` are redirected to `/`

### 5.3 Auth Middleware

```typescript
// src/middleware.ts
// Runs on every request except static assets
// 1. Refresh Supabase session (cookie refresh)
// 2. If no session → redirect to /login (except public routes)
// 3. If session → allow access, redirect away from /login
```

**Protected routes:** Everything under `/(dashboard)/`
**Public routes:** `/(auth)/*`

---

## 6. Roles & Permissions

### 6.1 Role Hierarchy

| Role | Level | Description |
|---|---|---|
| `admin` | 3 | Full system access. Manages users, teams, scopes, integrations. |
| `team_lead` | 2 | Manages their own team. Can add/remove users from their team. |
| `user` | 1 | Standard user. Access determined by assigned scopes. |

- Roles are stored in the `profiles` table (column: `role`)
- A user has exactly **one** role
- Higher roles inherit all lower role capabilities

### 6.2 Role Capabilities

| Action | Admin | Team Lead | User |
|---|---|---|---|
| View dashboard | Yes | Yes | Yes |
| View own profile | Yes | Yes | Yes |
| Edit own profile | Yes | Yes | Yes |
| View customers (if scoped) | Yes | Yes | Yes |
| Create teams | Yes | No | No |
| Delete teams | Yes | No | No |
| Assign team lead to a team | Yes | No | No |
| Add user to any team | Yes | No | No |
| Remove user from any team | Yes | No | No |
| Add user to own team | Yes | Yes | No |
| Remove user from own team | Yes | Yes | No |
| Manage all users | Yes | No | No |
| Invite new users | Yes | No | No |
| Deactivate users | Yes | No | No |
| Assign scopes to users | Yes | No | No |
| Manage integrations (Fortnox) | Yes | No | No |
| Access system settings | Yes | No | No |

### 6.3 Scopes (Feature-Level Permissions)

Scopes control **which features** a user can access. They are feature-level toggles, not action-level.

**Architecture:**

```sql
-- Scope definitions (seeded, rarely changed)
CREATE TABLE scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,           -- e.g., 'customers', 'reports'
  label TEXT NOT NULL,                -- e.g., 'Customer Management'
  description TEXT,                   -- Human-readable description
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User-scope assignments
CREATE TABLE user_scopes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, scope_id)
);
```

**Initial scopes (seeded):**

| Key | Label | Description |
|---|---|---|
| `customers` | Customer Management | View and manage customer records |
| `teams` | Team Management | View team structure (manage = role-based) |
| `reports` | Reports | Access reporting dashboards |
| `integrations` | Integrations | View integration status |

**Rules:**
- Admins bypass scope checks — they always have access to everything
- Team Leads and Users require explicit scope assignments
- Scopes only control navigation visibility and page access
- Within an accessible feature, what a user can *do* is determined by their role
- New scopes are added by inserting rows into the `scopes` table

**Frontend usage:**

```typescript
// src/hooks/use-scope.ts
function useScope(scopeKey: string): boolean
// Returns true if the current user has access to the feature

// In navigation:
// Items are filtered by scope before rendering
// Pages check scope on mount and redirect if unauthorized
```

### 6.4 Extending the Permission System

To add a new feature:

1. Add a new scope row to the `scopes` table
2. Create the feature routes under `/(dashboard)/`
3. Add the navigation entry in `src/config/navigation.ts` with `scope: "new_feature_key"`
4. The scope check in the layout and the `useScope` hook handle the rest
5. Assign the scope to users via the admin panel

---

## 7. Database Schema

### 7.1 Core Tables

```sql
-- ═══════════════════════════════════════════════
-- PROFILES (extends Supabase auth.users)
-- ═══════════════════════════════════════════════
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'team_lead', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════
-- TEAMS
-- ═══════════════════════════════════════════════
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  lead_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════
-- SCOPES
-- ═══════════════════════════════════════════════
CREATE TABLE scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_scopes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope_id)
);


-- ═══════════════════════════════════════════════
-- CUSTOMERS (synced from Fortnox)
-- ═══════════════════════════════════════════════
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fortnox_customer_number TEXT UNIQUE,  -- Fortnox CustomerNumber
  name TEXT NOT NULL,
  org_number TEXT,                       -- Swedish organization number
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  zip_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'SE',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'removed')),
  account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fortnox_raw JSONB,                    -- Full Fortnox response for reference
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_account_manager ON customers(account_manager_id);
CREATE INDEX idx_customers_fortnox_number ON customers(fortnox_customer_number);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════
-- FORTNOX INTEGRATION STATE
-- ═══════════════════════════════════════════════
CREATE TABLE fortnox_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  fortnox_tenant_id TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by UUID REFERENCES profiles(id),
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  sync_error TEXT,
  websocket_offset TEXT,               -- Last processed websocket offset for customers topic
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON fortnox_connection
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════
-- AUDIT LOG (optional but recommended)
-- ═══════════════════════════════════════════════
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                  -- e.g., 'user.created', 'customer.updated'
  entity_type TEXT NOT NULL,             -- e.g., 'user', 'customer', 'team'
  entity_id UUID,
  metadata JSONB,                        -- Additional context
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
```

### 7.2 Row Level Security (RLS)

All tables have RLS enabled. Policies follow the role hierarchy.

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fortnox_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ─── Helper function: get current user's role ───
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Helper function: check if user has scope ───
CREATE OR REPLACE FUNCTION has_scope(scope_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_scopes us
    JOIN scopes s ON s.id = us.scope_id
    WHERE us.user_id = auth.uid() AND s.key = scope_key
  ) OR get_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── PROFILES ───
-- Everyone can read profiles (needed for UI: avatars, names, team members)
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
-- Users can update their own profile (name, avatar)
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())  -- Can't change own role
  );
-- Admins can update any profile
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE USING (get_user_role() = 'admin');

-- ─── TEAMS ───
CREATE POLICY teams_select ON teams FOR SELECT USING (true);
CREATE POLICY teams_insert ON teams FOR INSERT WITH CHECK (get_user_role() = 'admin');
CREATE POLICY teams_update ON teams FOR UPDATE USING (get_user_role() = 'admin');
CREATE POLICY teams_delete ON teams FOR DELETE USING (get_user_role() = 'admin');

-- ─── SCOPES ───
CREATE POLICY scopes_select ON scopes FOR SELECT USING (true);
CREATE POLICY scopes_manage ON scopes FOR ALL USING (get_user_role() = 'admin');

-- ─── USER_SCOPES ───
CREATE POLICY user_scopes_select ON user_scopes FOR SELECT USING (true);
CREATE POLICY user_scopes_manage ON user_scopes FOR ALL USING (get_user_role() = 'admin');

-- ─── CUSTOMERS ───
CREATE POLICY customers_select ON customers FOR SELECT USING (has_scope('customers'));
CREATE POLICY customers_update ON customers FOR UPDATE USING (has_scope('customers'));
-- Insert/delete only via server (service role) for Fortnox sync

-- ─── FORTNOX_CONNECTION ───
CREATE POLICY fortnox_select ON fortnox_connection FOR SELECT USING (get_user_role() = 'admin');
CREATE POLICY fortnox_manage ON fortnox_connection FOR ALL USING (get_user_role() = 'admin');

-- ─── AUDIT_LOG ───
CREATE POLICY audit_select ON audit_log FOR SELECT USING (get_user_role() = 'admin');
-- Insert via service role only (server-side)
```

### 7.3 Seed Data

```sql
-- supabase/seed.sql

-- Default scopes
INSERT INTO scopes (key, label, description) VALUES
  ('customers', 'Customer Management', 'View and manage customer records synced from Fortnox'),
  ('teams', 'Team Management', 'View team structure and members'),
  ('reports', 'Reports', 'Access reporting and analytics dashboards'),
  ('integrations', 'Integrations', 'View integration status and sync logs');

-- Note: First admin user is created manually:
-- 1. User signs in via magic link
-- 2. Run SQL to promote: UPDATE profiles SET role = 'admin' WHERE email = 'admin@company.com';
```

---

## 8. Navigation

### 8.1 Navigation Architecture

Navigation is defined declaratively in `src/config/navigation.ts`. The sidebar component reads this configuration and renders items, filtering by user role and scopes.

```typescript
// src/config/navigation.ts
import { type LucideIcon } from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  scope?: string           // Feature scope required (omit = always visible)
  minRole?: "admin" | "team_lead" | "user"  // Minimum role (default: "user")
  badge?: "new" | "beta"   // Optional badge
  children?: NavItem[]     // Nested items (one level only)
}

export interface NavSection {
  title?: string            // Optional section header
  items: NavItem[]
}

// Navigation is an array of sections
export const navigation: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Customers", href: "/customers", icon: Users, scope: "customers" },
      { label: "Teams", href: "/teams", icon: UserCog, scope: "teams" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Users", href: "/users", icon: Shield, minRole: "admin" },
      { label: "Settings", href: "/settings", icon: Settings, minRole: "admin" },
    ],
  },
]
```

### 8.2 Navigation Rules

1. **Visibility**: Items only render if the user has the required scope AND meets the minimum role
2. **Active state**: Current route is highlighted, including parent items when a child route is active
3. **Keyboard accessible**: Full keyboard navigation with `Tab`, `Enter`, `Escape`
4. **Responsive**: Sidebar collapses to icon-only on smaller screens, full overlay on mobile
5. **Stable**: Navigation never flickers, jumps, or re-renders unnecessarily. Sidebar state (collapsed/expanded) is persisted in localStorage.
6. **Route protection**: Even if a user manually navigates to a URL they shouldn't access, the page-level scope check redirects them

---

## 9. UI Component System

### 9.1 Component Architecture (Two Layers)

The UI has two distinct layers:

**Layer 1: shadcn/ui primitives** (`src/components/ui/`)
- Installed via `npx shadcn@latest add <component>`
- Provides accessible, unstyled-ish primitives: Button, Input, Select, Dialog, DropdownMenu, etc.
- These files are **owned by us** (copied, not imported from node_modules)
- Consume our CSS variables automatically via Tailwind
- **Never import Radix directly** — always go through shadcn/ui wrappers

**Layer 2: App-level components** (`src/components/`)
- Built on top of shadcn/ui primitives
- Encode our business patterns: FormField, DataTable, PageHeader, EmptyState
- These carry app-specific logic, layout, and composition

```
src/components/
├── ui/                        # Layer 1: shadcn/ui primitives (DO NOT MODIFY)
│   ├── button.tsx             # npx shadcn@latest add button
│   ├── input.tsx              # npx shadcn@latest add input
│   ├── label.tsx              # npx shadcn@latest add label
│   ├── select.tsx             # npx shadcn@latest add select
│   ├── dialog.tsx             # npx shadcn@latest add dialog
│   ├── alert-dialog.tsx       # npx shadcn@latest add alert-dialog
│   ├── dropdown-menu.tsx      # npx shadcn@latest add dropdown-menu
│   ├── badge.tsx              # npx shadcn@latest add badge
│   ├── avatar.tsx             # npx shadcn@latest add avatar
│   ├── card.tsx               # npx shadcn@latest add card
│   ├── table.tsx              # npx shadcn@latest add table
│   ├── skeleton.tsx           # npx shadcn@latest add skeleton
│   ├── tooltip.tsx            # npx shadcn@latest add tooltip
│   ├── separator.tsx          # npx shadcn@latest add separator
│   ├── sheet.tsx              # npx shadcn@latest add sheet (mobile sidebar)
│   ├── command.tsx            # npx shadcn@latest add command (search palette)
│   ├── popover.tsx            # npx shadcn@latest add popover
│   ├── checkbox.tsx           # npx shadcn@latest add checkbox
│   ├── switch.tsx             # npx shadcn@latest add switch
│   ├── tabs.tsx               # npx shadcn@latest add tabs
│   ├── textarea.tsx           # npx shadcn@latest add textarea
│   ├── form.tsx               # npx shadcn@latest add form (react-hook-form integration)
│   └── sonner.tsx             # npx shadcn@latest add sonner
├── app/                       # Layer 2: App-level compositions
│   ├── icon-wrapper.tsx       # Consistent icon sizing/coloring (custom)
│   ├── nav-link.tsx           # Internal link with active state detection (custom)
│   ├── form-field.tsx         # Label + input + error + description (wraps shadcn Form)
│   ├── search-input.tsx       # Search with icon + clear button (wraps shadcn Input)
│   ├── form-actions.tsx       # Save/Cancel button row (wraps shadcn Button)
│   ├── confirm-dialog.tsx     # "Are you sure?" pattern (wraps shadcn AlertDialog)
│   ├── data-table.tsx         # Sortable, filterable, paginated table (wraps shadcn Table + @tanstack/react-table)
│   ├── data-table-toolbar.tsx # Search + filters row for DataTable
│   ├── empty-state.tsx        # No data placeholder with icon + action
│   ├── loading-state.tsx      # Skeleton grid matching expected content
│   ├── page-header.tsx        # Title + description + action buttons
│   ├── status-badge.tsx       # Colored status indicator (wraps shadcn Badge)
│   └── user-avatar.tsx        # Avatar with fallback initials (wraps shadcn Avatar)
├── layout/
│   ├── sidebar.tsx
│   ├── sidebar-nav.tsx
│   ├── topbar.tsx
│   └── breadcrumbs.tsx
└── emails/                    # React Email templates (NOT shadcn)
    ├── magic-link.tsx
    ├── welcome.tsx
    ├── team-invite.tsx
    └── layout.tsx
```

### 9.2 Component Principles

1. **Two-layer rule** — shadcn/ui primitives in `ui/` are the foundation. App components in `app/` compose them. Pages consume app components. Never skip a layer.
2. **Semantic props, not style props** — `<Button variant="destructive">` not `<Button className="bg-red-500">`
3. **Accessible by default** — shadcn/ui + Radix handles ARIA, focus management, keyboard navigation out of the box. Don't override it.
4. **Consistent API** — All components accept `className` for extension via `cn()` utility (clsx + tailwind-merge).
5. **No bare HTML for interactive elements** — Use shadcn `<Button>`, `<Input>`, `<Select>` etc. Never `<button>`, `<input>`, `<select>`.
6. **Form pattern** — All forms use `react-hook-form` + `zod` + shadcn `<Form>` component for consistent validation, error display, and submission handling.

### 9.3 App Component Specs

#### IconWrapper (Custom — not from shadcn)

```typescript
interface IconWrapperProps {
  icon: LucideIcon
  size?: "sm" | "md" | "lg"  // Maps to 16px, 20px, 24px
  color?: "primary" | "secondary" | "brand" | "success" | "warning" | "error"
  className?: string
}
// Ensures consistent icon sizing and coloring across the entire app
// All icons in the app go through this wrapper
```

#### NavLink (Custom — wraps Next.js Link)

```typescript
interface NavLinkProps {
  href: string
  icon?: LucideIcon
  label: string
  active?: boolean          // Auto-detected from current route
  collapsed?: boolean       // Sidebar collapsed mode — show icon only + tooltip
  badge?: string
}
// Used exclusively in sidebar navigation
```

#### FormField (Wraps shadcn Form components)

```typescript
// Uses react-hook-form's FormField + shadcn's FormItem, FormLabel, FormControl, FormMessage
// Provides consistent label + input + error + description pattern
// Example usage:
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input placeholder="user@company.com" {...field} />
      </FormControl>
      <FormDescription>The user's work email address.</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

#### DataTable (Wraps shadcn Table + @tanstack/react-table)

```typescript
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string           // Column key for search filtering
  searchPlaceholder?: string
  emptyState?: {
    icon: LucideIcon
    title: string
    description: string
    action?: { label: string; onClick: () => void }
  }
  loading?: boolean
  pageSize?: number            // Default: 10
}
// Used for all list views (customers, users, teams)
// Includes: column sorting, search filtering, pagination
```

#### ConfirmDialog (Wraps shadcn AlertDialog)

```typescript
interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string        // Default: "Confirm"
  cancelLabel?: string         // Default: "Cancel"
  variant?: "default" | "destructive"
  onConfirm: () => void | Promise<void>
  loading?: boolean
}
// Used for all destructive actions: delete team, deactivate user, disconnect integration
```

### 9.4 shadcn/ui Theme Integration

shadcn/ui expects CSS variables in a specific naming convention. Our `theme.css` maps to these:

```css
/* src/styles/theme.css — shadcn/ui variable mapping */
:root {
  /* shadcn/ui expected variables (mapped from our semantic tokens) */
  --background: var(--color-bg-primary);
  --foreground: var(--color-text-primary);
  --card: var(--color-bg-primary);
  --card-foreground: var(--color-text-primary);
  --popover: var(--color-bg-primary);
  --popover-foreground: var(--color-text-primary);
  --primary: var(--color-brand-primary);
  --primary-foreground: var(--color-text-on-brand);
  --secondary: var(--color-bg-secondary);
  --secondary-foreground: var(--color-text-primary);
  --muted: var(--color-bg-tertiary);
  --muted-foreground: var(--color-text-secondary);
  --accent: var(--color-brand-primary-subtle);
  --accent-foreground: var(--color-text-primary);
  --destructive: var(--color-error);
  --destructive-foreground: var(--color-text-on-brand);
  --border: var(--color-border-default);
  --input: var(--color-border-default);
  --ring: var(--color-brand-primary);
  --radius: var(--radius-md);
}

/* Dark mode — same mapping, different source values */
[data-theme="dark"] {
  --background: var(--color-bg-primary);
  --foreground: var(--color-text-primary);
  /* ... same mappings, theme.css dark overrides cascade through */
}
```

This means: change `--color-brand-primary` in one place → every shadcn Button, every focus ring, every accent color updates automatically.

### 9.5 Layout Components

- **PageHeader**: Title + description + optional action buttons (top of every page). Uses shadcn `Button` for actions.
- **Breadcrumbs**: Auto-generated from route, with customizable labels. Uses `NavLink` for segments.
- **EmptyState**: Icon + title + description + optional action button. Centered in content area.
- **LoadingState**: shadcn `Skeleton` components matching the expected content layout.

---

## 10. Fortnox Integration

### 10.1 Authentication (OAuth2)

Fortnox uses OAuth2 Authorization Code flow.

**Flow:**
1. Admin clicks "Connect Fortnox" in Settings → Integrations
2. System redirects to Fortnox authorization URL:
   ```
   https://apps.fortnox.se/oauth-v1/auth?
     client_id={CLIENT_ID}&
     redirect_uri={REDIRECT_URI}&
     scope=customer&
     state={CSRF_STATE}&
     response_type=code
   ```
3. User authorizes in Fortnox
4. Fortnox redirects to `/api/fortnox/auth` with `code`
5. System exchanges code for `access_token` + `refresh_token`
6. Tokens stored in `fortnox_connection` table (encrypted at rest)
7. System triggers initial customer sync

**Token refresh:**
- Access tokens expire (typically 1 hour)
- Refresh tokens are used to obtain new access tokens
- A scheduled job or on-demand check refreshes before expiry
- Refresh token rotation: each refresh returns a new refresh token

**Required Fortnox API scopes:** `customer`

### 10.2 Customer Sync

**Initial Sync (full import):**
1. Fetch all customers from Fortnox: `GET /3/customers?limit=500&offset=0`
2. Paginate through all results
3. Upsert into `customers` table (match on `fortnox_customer_number`)
4. Set `last_synced_at` and `fortnox_raw` (full JSON response)
5. Mark `sync_status = 'idle'` when complete

**Rate limit awareness:**
- Fortnox allows **300 requests/minute** per tenant (25 req/5 sec sliding window)
- Implement request queuing with backoff
- Respect `429 Too Many Requests` — retry after backoff

**Fortnox Customer fields mapped:**

| Fortnox Field | DB Column | Notes |
|---|---|---|
| `CustomerNumber` | `fortnox_customer_number` | Unique identifier |
| `Name` | `name` | Company/person name |
| `OrganisationNumber` | `org_number` | Swedish org number |
| `Email` | `email` | |
| `Phone1` | `phone` | Primary phone |
| `Address1` | `address_line1` | |
| `Address2` | `address_line2` | |
| `ZipCode` | `zip_code` | |
| `City` | `city` | |
| `Country` | `country` | |
| `Active` | `status` | `true` → `active`, `false` → `archived` |
| *(entire response)* | `fortnox_raw` | JSONB for future field access |

### 10.3 Real-Time Sync (Websocket)

Fortnox provides a websocket API for real-time events, powered by Apache Kafka.

**Connection:**
- Single websocket connection for all tenants
- Topic: `"customers"` — listens for customer create/update/delete events
- Events contain `topic`, `offset`, `type`, `tenantId`, `entityId`, `timestamp`
- Events are **minimal** — they indicate *what* changed, not the full data
- On event: call Fortnox API to fetch the updated customer

**Event handling strategy:**

```
Customer Created → Fetch from Fortnox API → INSERT into customers table
Customer Updated → Fetch from Fortnox API → UPDATE customers table
Customer Deleted → SET status = 'removed' in customers table (soft delete)
```

**Resilience:**
- Store last processed `offset` per topic in `fortnox_connection.websocket_offset`
- On reconnect, resume from stored offset
- Fortnox supports going back up to **2 weeks** if events were missed
- Handle duplicate events (at-least-once delivery) — idempotent upserts

**Implementation approach:**
The websocket listener runs as a **long-lived server process** — not as a Next.js API route (which is short-lived). Options:
1. **Separate Node.js worker** deployed alongside the Next.js app
2. **Supabase Edge Function** with persistent connection (if supported)
3. **Scheduled polling** as fallback (every 5 minutes) + websocket as enhancement

> **Recommendation:** Start with scheduled polling (`/api/fortnox/sync` triggered by cron) and add websocket listener as a separate worker process once the base system is stable.

### 10.4 Account Manager Assignment

- Each customer has an `account_manager_id` referencing a `profiles` row
- This field is **local only** — not synced to Fortnox
- Admin can assign any user as account manager
- Team Lead can assign users from their team as account manager
- The Account Manager field appears on the customer detail page
- Customers can be filtered by "My Customers" (where current user is account manager)

---

## 11. Email System (Resend)

### 11.1 Architecture

Resend serves two purposes:

1. **Supabase auth emails** — Magic links, via Supabase custom SMTP configuration
2. **Application emails** — Welcome messages, team invitations, notifications

### 11.2 Email Templates

Built with `@react-email/components` for consistent, cross-client rendering.

**Templates:**

| Template | Trigger | Variables |
|---|---|---|
| `magic-link.tsx` | Supabase auth (automatic) | `{{ .ConfirmationURL }}` — handled by Supabase |
| `welcome.tsx` | After first login | `userName`, `systemName`, `dashboardUrl` |
| `team-invite.tsx` | User added to team | `userName`, `teamName`, `invitedBy` |

**Template layout** (`emails/layout.tsx`):
- Company logo from `system.logoMark`
- System name from `system.name`
- Footer with `system.companyName`
- Consistent colors pulled from theme

### 11.3 Sending Pattern

```typescript
// src/lib/resend/client.ts
import { Resend } from "resend"

let resendClient: Resend | null = null

export function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set")
    }
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

// Usage in API route:
const resend = getResend()
await resend.emails.send({
  from: `${system.name} <${system.supportEmail}>`,
  to: [user.email],
  subject: `Welcome to ${system.name}`,
  react: WelcomeEmail({ userName: user.full_name, systemName: system.name }),
})
```

> **Note:** The Resend client uses lazy initialization via `getResend()` to prevent build failures when `RESEND_API_KEY` is not set (e.g., during `next build` in CI).

---

## 12. User Management (CRUD)

### 12.1 User Lifecycle

| Action | Actor | Flow |
|---|---|---|
| **Invite** | Admin | Enter email → System sends magic link → Profile auto-created on first login |
| **Read** | Admin (all), Team Lead (own team), User (own profile) | User list page, user detail |
| **Update** | Admin (any user), User (own profile: name, avatar) | Edit form on user detail / profile page |
| **Deactivate** | Admin | Set `is_active = false` → User can no longer log in |
| **Reactivate** | Admin | Set `is_active = true` |
| **Change role** | Admin | Dropdown on user detail page |
| **Assign to team** | Admin (any), Team Lead (own team) | Dropdown / search on user or team page |
| **Remove from team** | Admin (any), Team Lead (own team) | Action on team member list |
| **Assign scopes** | Admin | Checkboxes on user detail page |

### 12.2 Invitation Flow

1. Admin enters email address in user management
2. System calls `supabase.auth.admin.inviteUserByEmail(email)` (service role)
3. Supabase sends magic link invite via Resend SMTP
4. User clicks link → account created, profile trigger fires
5. User is redirected to dashboard, sees welcome state
6. Admin assigns role, team, and scopes

### 12.3 Team Management

| Action | Actor |
|---|---|
| Create team | Admin |
| Edit team name/description | Admin |
| Delete team | Admin (only if empty) |
| Assign team lead | Admin |
| Add member to team | Admin (any), Team Lead (own team) |
| Remove member from team | Admin (any), Team Lead (own team) |

**Constraints:**
- A user belongs to **at most one team** (nullable `team_id`)
- A team has **at most one lead** (`lead_id`)
- A team lead must have role `team_lead` or `admin`
- Deleting a team sets `team_id = NULL` on all members

---

## 13. Accessibility & UX Standards

### 13.1 Accessibility Requirements (WCAG 2.1 AA)

| Requirement | Implementation |
|---|---|
| **Keyboard navigation** | All interactive elements reachable via `Tab`. Dialogs trap focus. `Escape` closes overlays. |
| **Screen reader support** | Semantic HTML, ARIA labels on icon-only buttons, live regions for toasts |
| **Color contrast** | All text meets 4.5:1 ratio against background (checked via oklch values) |
| **Focus indicators** | Visible focus ring (2px solid, brand color, offset) on all interactive elements |
| **Motion sensitivity** | Respect `prefers-reduced-motion` — disable GSAP animations, transitions become instant |
| **Error identification** | Form errors displayed inline with red text + icon, linked to input via `aria-describedby` |
| **Loading states** | Skeleton screens, spinner on buttons — never blank/jumpy states |
| **Touch targets** | Minimum 44x44px for all clickable elements on touch devices |

### 13.2 UX Principles

1. **No layout shift** — Content loads in skeleton shapes, then fills in. No jumping.
2. **Instant feedback** — Every action has immediate visual feedback (optimistic UI, toasts, button loading states)
3. **Progressive disclosure** — Don't show everything at once. Use tabs, expandable sections, dialogs for secondary info.
4. **Consistent patterns** — Every list page looks the same (search, filter, table, pagination). Every form looks the same (labels, inputs, actions).
5. **Recoverable actions** — Destructive actions require confirmation dialog. Soft deletes where possible.
6. **Responsive** — Works on desktop (primary), tablet, and mobile. Sidebar becomes overlay on mobile.

### 13.3 GSAP Animation Guidelines

- **Page transitions**: Fade + subtle slide (200ms) between route changes
- **Micro-interactions**: Button press scale, card hover lift, sidebar collapse
- **Data loading**: Stagger animation when list items load
- **Respect `prefers-reduced-motion`**: All GSAP animations wrapped in motion check

```typescript
// Pattern for all GSAP usage:
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
if (!prefersReducedMotion) {
  gsap.from(element, { opacity: 0, y: 10, duration: 0.2 })
}
```

---

## 14. Environment Variables

```bash
# .env.local (never committed)

# ─── Supabase ───
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...             # Server-side only

# ─── Resend ───
RESEND_API_KEY=re_xxxx                       # Server-side only

# ─── Fortnox ───
FORTNOX_CLIENT_ID=xxxxx
FORTNOX_CLIENT_SECRET=xxxxx                  # Server-side only
FORTNOX_REDIRECT_URI=https://system.company.com/api/fortnox/auth

# ─── App ───
NEXT_PUBLIC_APP_URL=https://system.company.com
```

**Rules:**
- `NEXT_PUBLIC_*` variables are exposed to the browser — never put secrets here
- Server-only variables are accessed only in API routes, Server Components, and server actions
- `.env.local` is in `.gitignore`
- `.env.example` documents all required variables with placeholder values

---

## 15. Development Conventions

### 15.1 Code Style

| Area | Convention |
|---|---|
| **Naming** | `camelCase` for variables/functions, `PascalCase` for components/types, `SCREAMING_SNAKE` for constants, `kebab-case` for file names |
| **Exports** | Named exports everywhere. No default exports (except `page.tsx`, `layout.tsx` as required by Next.js). |
| **Components** | One component per file. File name matches component name. |
| **Types** | Co-located with usage, or in `src/types/` for shared types. Avoid `any`. |
| **Imports** | Absolute imports via `@/` alias. Group: 1) React/Next, 2) External libs, 3) Internal (`@/`). Zod v4 must be imported as `import { z } from "zod/v4"`. |
| **Comments** | Explain *why*, not *what*. No commented-out code. |

### 15.2 File Naming

```
components/ui/button.tsx           # Component file (kebab-case)
lib/supabase/client.ts             # Utility file (kebab-case)
hooks/use-user.ts                  # Hook (use- prefix, kebab-case)
types/database.ts                  # Type file
app/(dashboard)/customers/page.tsx # Route page
```

### 15.3 Error Handling

- API routes return structured error responses: `{ error: string, code?: string }`
- Form validation uses Zod schemas via `react-hook-form` + `@hookform/resolvers/zod` — errors displayed inline through shadcn `<FormMessage>`
- Unexpected errors caught by error boundaries (Next.js `error.tsx`)
- Never swallow errors silently
- Toast notifications via `sonner` (shadcn Sonner component) for action results (success/error)

### 15.4 Form Pattern (Standard)

All forms in the app follow this exact pattern:

```typescript
// 1. Define Zod schema
const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
})

// 2. Use react-hook-form with Zod resolver
const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
  defaultValues: { name: "", email: "" },
})

// 3. Render with shadcn Form components
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField control={form.control} name="name" render={...} />
    <FormField control={form.control} name="email" render={...} />
    <Button type="submit" disabled={form.formState.isSubmitting}>
      {form.formState.isSubmitting ? "Saving..." : "Save"}
    </Button>
  </form>
</Form>
```

### 15.5 Data Fetching

- **Server Components** (default): Fetch data on the server, pass as props
- **Client Components**: Only when interactivity is needed (forms, dynamic UI)
- **Server Actions**: For mutations (form submissions, status changes)
- **API Routes**: Only for webhooks, external integrations (Fortnox), cron jobs

---

## 16. Migration & Setup Checklist

### For a New Deployment

```markdown
1. [ ] Clone repository
2. [ ] Copy `.env.example` → `.env.local`, fill in values
3. [ ] Install dependencies: `pnpm install`
4. [ ] shadcn/ui is pre-configured — components already in `src/components/ui/`
5. [ ] Create Supabase project
6. [ ] Configure Resend SMTP in Supabase Auth settings
7. [ ] Run migrations: `pnpm supabase db push` (supabase CLI is a devDependency)
8. [ ] Update `src/config/system.ts` with company branding
9. [ ] Update `src/styles/theme.css` with company colors and fonts
10. [ ] Place logo files in `/public/brand/`
11. [ ] Deploy to Vercel
12. [ ] Create first admin user (login + SQL role update)
13. [ ] Connect Fortnox via Settings → Integrations
14. [ ] Run initial customer sync
13. [ ] Invite team members
```

---

## 17. Future Extensibility

This architecture is designed to grow. Here's how common additions fit:

### Adding a New Module (e.g., "Invoices")

1. **Database**: New migration file with table + RLS policies
2. **Scope**: Insert new scope row: `INSERT INTO scopes (key, label) VALUES ('invoices', 'Invoices')`
3. **Routes**: Create `app/(dashboard)/invoices/page.tsx` + `[id]/page.tsx`
4. **Navigation**: Add entry to `src/config/navigation.ts` with `scope: "invoices"`
5. **Components**: Reuse `DataTable`, `PageHeader`, `EmptyState` etc.
6. **Types**: Add Zod schemas in `lib/validations/invoice.ts`

### Adding a New Integration

1. **Library**: Create `src/lib/{integration}/client.ts`
2. **API Routes**: `app/api/{integration}/...`
3. **Database**: Migration for connection state + synced data
4. **Settings UI**: New tab in Settings → Integrations

### Adding Action-Level Permissions (Future)

If feature-level scopes become insufficient:
1. Extend `scopes` table with an `actions` JSONB column
2. Or create a `scope_actions` table
3. Update `has_scope()` function to accept optional action parameter
4. Maintain backward compatibility — feature-level checks still work

---

## 18. Open Questions / Decisions to Make During Development

| # | Question | Options | Decision |
|---|---|---|---|
| 1 | Fortnox websocket vs. polling for initial release | Polling first, websocket later | **Polling first** |
| 2 | Dark mode support timeline | Build now, build later | TBD |
| 3 | Notification system (in-app) | Build now, build later | TBD |
| 4 | Customer notes/activity log | Part of MVP or later | TBD |
| 5 | File attachments on customers | Part of MVP or later | TBD |
| 6 | Email notifications for team changes | Part of MVP or later | TBD |

---

*Last updated: 2026-03-06*
*Version: 1.1.0 — Aligned with implementation (Next.js 16, PKCE auth, TW4, Zod v4, lazy Resend, supabase devDep)*
