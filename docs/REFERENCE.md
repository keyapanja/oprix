# Operix — Reference

The single design/setup reference for Operix. **Current build state** (what's
live, conventions, what's pending) lives in [`STATUS.md`](STATUS.md); this file
is the slower-moving *how it's built and why*.

Contents:
1. [Local setup](#1-local-setup)
2. [Architecture & foundations](#2-architecture--foundations)
3. [Build roadmap](#3-build-roadmap)
4. [Companion browser extension — design](#4-companion-browser-extension--design)

The functional spec (what each module does) lives in `Operix.pdf`. The data
model is `prisma/schema.prisma`. Day-to-day load/use of the extension is in
[`extension/README.md`](../extension/README.md).

---

## 1. Local setup

Prerequisites: Node 22+, npm 10+. Database: Supabase (free tier is fine).

### 1.1 Create the Supabase database
1. [supabase.com](https://supabase.com) → sign in → **New project**.
2. Name it `operix`, set a strong **database password** (save it), pick a nearby region.
3. Wait ~2 min to provision.
4. **Project Settings → Database → Connection string** — you need two URLs:
   - **Transaction pooler** (port `6543`, add `?pgbouncer=true`) → `DATABASE_URL` (runtime).
   - **Session / direct** (port `5432`) → `DIRECT_URL` (migrations).
   - Replace `[YOUR-PASSWORD]` in each with the password from step 2.

### 1.2 Configure environment
1. Copy `.env.example` to `.env`.
2. Paste both connection strings into `DATABASE_URL` and `DIRECT_URL`.
3. Generate `AUTH_SECRET`:
   ```powershell
   [Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Max 256}))
   ```
   Paste the result into `AUTH_SECRET`. (Optional: SMTP, `CRON_SECRET`,
   `EXTENSION_ORIGINS` — see `.env.example`.)

### 1.3 Create the schema & run
```powershell
npm install
npm run db:generate      # generate the Prisma client
npm run db:push          # create/update tables from prisma/schema.prisma
npm run dev              # http://localhost:3000
```

> **Shared / production DB:** use **`db:push` only — never `db:seed`** (it would
> wipe/replace real data). Seeding is only for a *fresh, empty, local* database:
> `npm run db:seed` creates a demo company + Super Admin
> (`admin@operix.test` / `ChangeMe123!` — change after first login).

> **Windows dev caveat:** stop the dev server (free port 3000) before
> `db:push` — a running server holds the Prisma engine DLL and `prisma generate`
> fails with EPERM.

### 1.4 Connection-string gotchas (Supabase)
Two things that silently break the connection:
1. **URL-encode special characters in the password.** `Go@1$` must become
   `Go%401%24` (`@`→`%40`, `$`→`%24`, `:`→`%3A`, `/`→`%2F`). An un-encoded `@`
   collides with the `@` separating credentials from the host.
2. **Don't use the direct `db.<ref>.supabase.co` host for migrations** — Supabase
   serves it IPv6-only, which usually fails from a normal network. Use the
   **session pooler** (`<region>.pooler.supabase.com:5432`, user `postgres.<ref>`)
   for `DIRECT_URL`, and the **transaction pooler** (`:6543` + `?pgbouncer=true`)
   for `DATABASE_URL`.

### 1.5 Handy commands
| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run db:push` | Push schema without a migration (current workflow) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Open Prisma Studio to browse data |
| `npm run db:seed` | Seed a **fresh local** DB (never against shared data) |

---

## 2. Architecture & foundations

> Unified business-operations platform for service businesses: HR, projects,
> attendance, payroll, clients, reporting — one system.

This section is the source of truth for *how* Operix is built.

### 2.1 Tech stack (as designed; see STATUS.md for what's actually wired)
| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router, Turbopack)** | One codebase for UI + API (route handlers / server actions). SSR for dashboards. In this repo the "middleware" convention is renamed **`proxy.ts`**. |
| Language | **TypeScript** (strict) | Type safety across a large domain. |
| Database | **PostgreSQL** (Supabase) | Relational integrity for HR/payroll; strong JSON support. |
| ORM | **Prisma 6.19.3** (pinned) | Type-safe queries, single schema file. Prisma 7 moved DB URLs to a config file — hence the pin. |
| Auth | **`jose` JWT in an httpOnly cookie** (credentials only) | We only need email/password — a signed-cookie session is lighter than NextAuth on Next 16. Session carries `userId, companyId, role, email, employeeId, clientId`. Swap in Auth.js later if OAuth/SSO is needed. |
| Validation | **Zod** | Shared client/server validation. |
| UI | **Tailwind v4** + custom primitives | Searchable `Combobox`, themed `DatePicker`, `Modal`/drawer, `Avatar`, global `toast` + `confirmDialog`. Emerald/teal palette, full light+dark. |
| Files | **On-disk `uploads/`** (polymorphic `Attachment`) | Task/project attachments + avatar/logo live on disk, served via scoped routes; only metadata/keys in the DB. (S3-compatible storage is the future multi-instance path — see STATUS.) |
| Email | **`nodemailer` SMTP** | Notification + invite delivery; falls back to console log if `SMTP_HOST` unset. |
| Background jobs | **Secured `/api/cron`** (+ lazy page-load fallback) | Day-before reminders + late-login notices. A real queue (BullMQ/pg-boss) is a later upgrade. |

**Folder shape:**
```
/app            Next.js routes (route groups: (app) staff, /portal client)
/lib            domain logic — services, not in route files
/lib/auth       session, RBAC guards (proxy.ts is the edge gate)
/lib/payroll    statutory calculators (India)
/prisma         schema.prisma
/components/ui  primitives
/extension      MV3 companion browser extension (own build)
/docs           this folder
```

**Rule:** business logic lives in `/lib/<domain>`, never inline in route
handlers. Routes are thin — auth-check, validate, call service, return.

### 2.2 Multi-tenancy (decided up front)
Every tenant-owned row carries a **`companyId`** — non-negotiable from day one;
retrofitting tenant isolation later is a rewrite.
- `Company` is the tenant root. For MVP one user belongs to one company; the
  model already supports many, so "multi-company" becomes a UI/session change.
- **Guardrail:** no service queries a tenant table without a `companyId` filter,
  and server actions re-check ownership (the proxy is only the first line).

### 2.3 Authorization
Roles with sharply different data access: `SUPER_ADMIN`, `HR_MANAGER`,
`PROJECT_MANAGER`, `TEAM_LEAD`, `EMPLOYEE`, `CLIENT` (portal only — only their
own projects).
- Now a **dynamic permission model** (`RolePermission` + `lib/auth/permissions.ts`,
  surfaced as the **Organization → Access** matrix); Super Admin is always full.
- **Two hard security boundaries** (extra scrutiny + tests): a `CLIENT` can never
  read another client's or any internal HR/payroll data; an `EMPLOYEE` can only
  read/write their own attendance, leave, timesheet, payslip.
- Enforced at the **service layer**, not just the UI. The proxy hard-separates
  audiences: clients live entirely under `/portal`, staff never see it.

### 2.4 Domain dependency map (drove build order)
```
                 Company (tenant)
                    │
      ┌─────────────┼───────────────┐
   Department      Team          Designation
      │
   Employee ──────────────┐
      │   │   │           │
      │   │   │        Manager (self-ref)
      │   │   └── Attendance ──┐
      │   └────── Leave        ├──► PAYROLL (computes from these)
      │           Timesheet ───┘
      │
   Project ── Task ── Subtask/Checklist/Comment/Dependency/Milestone
      │
   Client ── ClientContact
      │
   Client Portal (Deliverables, Approvals)  ← CLIENT role
```
**Payroll sits at the bottom** — it can't be trusted until attendance, leave, and
timesheets are solid. **Employee + Org sit at the top** — nothing works without
them.

### 2.5 Payroll — India statutory model (highest-risk module)
Payroll is **computed**, never hand-entered, from
`SalaryStructure + Attendance adjustments + Leave deductions + Overtime + Incentives`.
Rules encoded in `/lib/payroll` (rates in config/DB, not code — they change yearly):
- **PF (EPF):** employee 12% of basic (+DA); employer 12% (3.67% EPF + 8.33% EPS);
  wage ceiling configurable (₹15,000). Company on/off toggle (`Company.pfEnabled`).
- **ESI:** employee 0.75%, employer 3.25% of gross, below the ₹21,000 threshold.
  Company on/off toggle (`Company.esiEnabled`).
- **Professional Tax:** **state-specific slab** — a per-state config, not a constant.
- **TDS / income tax:** out of MVP scope (flag for decision).

**Principles:** money in **integer minor units** (paise), never floats; every
payslip stores a **frozen snapshot** of components + rates; runs are idempotent
and reversible (DRAFT → LOCKED → PAID).

### 2.6 Cross-cutting concerns
- **Activity log / audit timeline** — `ActivityLog`, written by services on key changes.
- **Notifications** — `Notification` rows + in-app/email channels, triggered by domain events.
- **Soft deletes** (`deletedAt`) on people/projects/clients.
- **Timezone** — all timestamps UTC; `Company.timezone` drives display + attendance-day boundaries.

### 2.7 Explicitly NOT building (per spec)
Recruitment, Asset/Expense/Goal/Budget management, Multi-Company UI, Workflow
Builder, AI features. The schema is designed so these slot in later without
breaking migrations.

---

## 3. Build roadmap

Originally built as **4 vertical slices**, top of the dependency graph
(Org/Employee) toward the bottom (Payroll). Recorded here for context; what's
actually shipped is in STATUS.md.

### Slice 0 — Project setup
Next.js + TS strict + Tailwind; Prisma + PostgreSQL; credential auth (session
carries `userId, companyId, role`); central capability map; `companyId`-scoped
Prisma client; seed (demo Company + Super Admin).

### Slice 1 — Foundation (Org, Employee, Roles & Permissions)
Company + Departments/Teams/Designations/Work Shifts; employee directory
(profile, documents, emergency contacts, reporting line); role-based shells +
guards; invite + login. **Security tests:** employee can't read others; client
sees nothing internal.

### Slice 2 — Time & Presence (Attendance, Leave, Timesheet, Resource Allocation) — *MVP ship point*
Clock in/out + monthly calendar; leave types/balances + request→manager→HR;
timesheet per project/task + approval; notifications wired. Ship internally here.

### Slice 3 — Delivery (Projects, Tasks, Clients, Client Portal, Knowledge Base)
Projects + tasks (subtasks, checklists, comments, attachments, dependencies,
milestones); task views; client DB + contacts + mapping; **client portal** (scoped
login, progress, deliverables, approve/request-revision — *hard isolation tests*);
KB (categories, articles, version history).

### Slice 4 — Money & Insight (Payroll, Reporting & Analytics)
Salary structures; payroll run (DRAFT→LOCKED→PAID); India statutory calculators;
payslip generation; reporting (employee/project/payroll/management dashboards).

### Engineering guardrails (throughout)
1. No tenant query without `companyId`. 2. Authorization at the service layer.
3. Business logic in `lib/<domain>`. 4. Money = integer paise. 5. Payslips are
immutable snapshots. 6. Statutory rates in config/DB. 7. Isolation/permission
tests written *with* the feature.

---

## 4. Companion browser extension — design

**Status: built (initially on localhost, 2026-06-16).** The backend API and the
extension are implemented and HTTP-verified. This section is the *design
rationale*; how to load and use it is [`extension/README.md`](../extension/README.md);
current state is in STATUS.md.

### 4.1 What it is
A **Manifest V3 extension** (Chrome/Edge first, Firefox via the same codebase)
whose content script injects a **dockable, always-on overlay** (Shadow-DOM
isolated) into every page. It lists the signed-in user's **RUNNING / PAUSED**
tasks with a live ticking timer, ▶/⏸/■ controls, expandable **checklist** and
**related KB guides**. Dock position (L/R/T/B), collapse, on/off, and theme are
customizable and persist across devices.

**Out of scope (v1):** creating/editing tasks, adding/deleting checklist items
(toggle only), non-task modules, realtime push (it polls).

### 4.2 Why a new API was required
The app was 100% Server Actions with **zero route handlers**. The session is one
**httpOnly** `operix_session` cookie (jose HS256, `sameSite=lax`) the extension
JS can't read and which won't ride cross-site fetches → it needs a **bearer
token** and a dedicated JSON API (`/api/ext/v1/*`), exempted in `proxy.ts` and
given its own CORS. Timer/checklist/KB logic is reused via shared cores (not
reinvented), and the same capabilities/task-scope authz applies.

### 4.3 Architecture
```
┌──────────────── User's browser (any website) ─────────────────┐
│  Content script (overlay)      ⇄ chrome.runtime ⇄   Service    │
│  React + Tailwind dock, Shadow DOM                   worker (bg)│
│  • task accordions  • live 1s timer  • checklist/KB     │ fetch │
│  Popup (connect/settings)   chrome.storage(token,prefs) │ Bearer│
└─────────────────────────────────────────────────────────│──────┘
                                                           ▼ HTTPS
                         Operix (Next.js 16)
                          proxy.ts ── exempt /api/ext/* ──┐
                          app/api/ext/v1/* route handlers │
                            ↳ bearer auth (ExtensionToken)│
                            ↳ CORS + OPTIONS              │
                            ↳ shared core (timer/checklist)
                          Prisma → PostgreSQL ◀──────────┘
```
**Key MV3 rule:** the content script never calls the API directly — it messages
the **background service worker** (which holds `host_permissions` for the Operix
origin and makes the authenticated fetch). SWs are ephemeral → never rely on
in-memory state; persist to `chrome.storage`, wake via `chrome.alarms`.

### 4.4 Auth & authorization
- **Token model:** an `ExtensionToken` table stores a **sha-256 hash** of the raw
  token (raw = `randomBytes(32).hex`, shown to the extension once at connect),
  with `label, lastUsedAt, expiresAt, revokedAt`. This doubles as the
  "connected devices / sign out everywhere" primitive for the web app.
- **Connect flow (preferred):** `chrome.identity.launchWebAuthFlow` opens the
  gated `/connect-extension` page; the user authenticates with their normal
  Operix login (no password ever entered in the extension); a Server Action mints
  the token and redirects it back. **Fallback:** rate-limited
  `POST /api/ext/v1/auth/login` (email+password) — used in the localhost build.
- **Request auth:** every call sends `Authorization: Bearer <token>`;
  `authenticateExtension(req)` hashes it, looks up a live token, bumps
  `lastUsedAt`, and rebuilds a `SessionUser`-equivalent. The token grants
  **exactly** the user's normal rights — reusing the same permission + task-scope
  helpers as the web app.
- **Revoke:** extension "Disconnect" → `POST /auth/revoke`; web app
  **Profile → Connected devices** revokes any token.

### 4.5 Endpoints (`/api/ext/v1`)
| Method | Path | Purpose |
|---|---|---|
| `OPTIONS` | `*` | CORS preflight → 204 |
| `GET` | `/me` | Validate token → user + capabilities |
| `POST` | `/auth/login` | (Fallback) email+pw → token (rate-limited) |
| `POST` | `/auth/revoke` | Disconnect current token |
| `GET` | `/tasks/active` | **Core feed**: running/paused tasks + timer + checklist + KB |
| `POST` | `/tasks/:id/timer` | `{action:'start'\|'pause'\|'stop'}` → new timer state |
| `POST` | `/checklist/:itemId` | `{isDone}` → toggle |

All JSON, CORS-wrapped, bearer-guarded (except OPTIONS / login). Shared DTOs live
in `shared/ext-contract.ts` (imported by both the API and the extension build) so
both sides stay in lockstep; the feed includes `serverTimeMs` to correct clock
skew for the client-side live timer.

### 4.6 Security & privacy
- Token hashed at rest, raw only in `storage.local`, bearer over HTTPS, revocable,
  `lastUsedAt` tracked.
- Every query re-scoped by `companyId` from the token (same `taskScopeWhere` as
  the web app — the extension can never see more than the user can).
- **CORS allowlist:** only published `chrome-extension://<id>` origins. In
  production, an unset `EXTENSION_ORIGINS` **fails closed** (no arbitrary-origin
  reflection); `/auth/login` is rate-limited.
- **Privacy on third-party pages:** the content script **reads nothing** from host
  pages — it only injects an isolated Shadow-DOM widget. `<all_urls>` is required
  for an always-on dock; mitigate with a per-site allow/deny list + clear
  disclosure for store review. CSP `connect-src` pinned to the API origin.

### 4.7 Repo & cross-browser
- **`extension/`** folder in the Operix repo (monorepo) so it shares the contract
  and ships alongside the API. The localhost build is a **plain MV3 extension
  (no build step)** — load the folder unpacked. (The original plan targeted WXT +
  React 19 + Tailwind v4 for the polished cross-browser build.)
- **Chrome + Edge** identical bundle; **Firefox** MV3 with minor `browser.*`
  differences; **Safari** needs an Xcode wrapper — deferred.
- **Going to production:** point `host_permissions` + the extension's "Operix
  address" at the live origin and set `EXTENSION_ORIGINS` on the server — config
  only, no rearchitecture (see `extension/README.md`).
