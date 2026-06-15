# Operix — Build Status Snapshot

Compact current-state reference (compresses the long build session). See
`docs/architecture.md` for rationale and `docs/roadmap.md` for the original plan.
_Last updated: 2026-06-15._

## Stack (as built)
- **Next.js 16** (App Router, Turbopack) · **TypeScript** strict · **Tailwind v4**
- **Prisma 6.19.3** (pinned — Prisma 7 moved DB URLs to a config file) · **PostgreSQL on Supabase** (shared dev DB with real data — `db:push` only, never `db:seed`)
- **Auth:** hand-rolled `jose` JWT in an httpOnly cookie (not NextAuth) + set-password invite flow
- **Email:** `nodemailer` SMTP — **Gmail configured in `.env` and verified sending**; falls back to console logging if `SMTP_HOST` is unset
- **UI:** custom primitives — searchable `Combobox`, themed `DatePicker`, `Modal` + right **offcanvas drawer** (portaled to body); emerald/teal palette; full **light + dark** theme (`.dark` class, no-flash script); **collapsible sidebar** (rail) with **accordion sub-menus**

## Modules live (all build-verified: `tsc` green)
- **Auth/RBAC** — login, logout, `proxy.ts` route guard, `/set-password`. **Dynamic permissions**: `RolePermission` table, `lib/auth/permissions.ts` resolves per-company (defaults from `lib/auth/can.ts`), **Organization → Access** matrix; Super Admin always full.
- **Dashboard** — role-aware; managers see stats, employees see the **punch in/out** card (live timer, shift **grace time**, late flag). Punching in now **auto-refreshes** (lifts the gate/banner without a manual reload).
- **Organization** — departments, teams/services, **department-wise designations**, work shifts (graceMinutes), **locations** (single/multi toggle), **probation periods**, Access matrix, **Task access** (per-role task visibility).
- **Employees** — directory, create (auto `EMP###`), **edit**, profile, emergency contacts, **email invite + resend**, account status.
- **Attendance** — admin daily grid (search / sort / per-page / pagination), self-service punch, **leave sync** (`markedManually` override), holiday banner, **late detection → notifications**.
- **Leave** — types with allowance **per month/year**; self-service **apply** (live balance, **half-day**, **WFH**, Employee→Manager→HR approval); adaptive page.
- **Calendar** — `/calendar` for everyone: holidays, who's away (leave/WFH), announcements; **click/drag dates** → modal to apply leave / add holiday / post announcement.
- **Projects** — list with progress, create, detail with **drag-and-drop Kanban** + list view.
- **Tasks** — full **review workflow** (To Do → In Progress → Review → Redo → Client Review → Completed); **Kanban + List**; create form with **inline assignees (multi, primary pre-filled) + checklist** (seeded from service template); checklists, comments (@-mentions), per-user **timers**. **Role-based visibility** (ALL / TEAM / OWN) enforced at the query level + sidebar filters (My tasks / Assigned by me) + admin department/service filters.
- **Time tracking** — per-task/per-user stopwatch; **pause is non-destructive** (banks to timesheet, keeps a PAUSED row), so the **global bottom bar** shows running + paused timers and supports **pause/resume from any page**; finalized (removed) when the task leaves a timeable state.
- **Clients** — list, contacts, project mapping; sidebar "New client" deep-link auto-opens the add form.
- **Notifications** — live topbar bell → **right offcanvas drawer**; dedicated **`/notifications` page** filterable by **color-coded category** (Tasks/Mentions/Attendance/Leave/Payroll/Clients/General); linked in drawer + left sidebar. Events that fire today: task workflow, @-mentions, late login.

## Key conventions / decisions
- **Multi-tenant**: every tenant row carries `companyId`; services scope by it.
- **Times**: stored as naive company-local wall-clock; displayed **12-hour**; "today" uses **company timezone** (`nowInZone`).
- **Money**: integer paise (for future payroll).
- **All dropdowns** must be the searchable `Combobox`.
- **Task visibility**: scope per role (`ALL`/`TEAM`/`OWN`) stored as namespaced `task:scope:*` rows in `RolePermission` (no schema change; ignored by capability resolution). `TEAM` = same department. Defaults: Admin/PM/HR = ALL, Team Lead = TEAM, Employee = OWN.
- **Notifications**: taxonomy + colors + deep-links in `lib/notifications/categories.ts` (isomorphic).

## Pending / what's left
**Not-started spec modules**
- **Resource Allocation** (Module 4) — schema only; no capacity vs. assigned-hours / utilization.
- **Timesheet** (Module 7) — only timer→TimeEntry logging exists; no daily/weekly/monthly views or **manager approval**.
- **Payroll** (Module 8) — schema only; India statutory PF/ESI/PT, salary structures, runs, payslip PDFs.
- **Client Portal** (Module 10) — schema + CLIENT role exist; no portal routes/UI.
- **Knowledge Base** (Module 11) — schema only.
- **Reporting & Analytics** (Module 12) — only basic dashboard counts.

**Foundational infra (each unblocks several modules)**
- **File uploads (S3/presigned)** — unwired; blocks employee docs, task attachments, payslip PDFs, deliverables, logo.
- **Scheduled jobs / cron** — none; late-check is on-demand; needed for proactive notifications + payroll runs.
- **Notification events + email channel** — UI is built; most domain events (leave approve/reject, task due, payroll) don't emit yet, and email delivery is wired only for invites.
- **Automated tests** — none (isolation/permission tests especially).

**Finishing touches on shipped modules**
- Attendance: break tracking (schema only), monthly attendance calendar view.
- Tasks: subtasks / dependencies / milestones (schema only); Calendar & Timeline views.
- Edit screens: work shifts, leave types, clients, company settings (create+delete only).
- Org/Employees: department-head assignment; employee deactivate (only soft-delete); document upload (stubbed).
- Leave: approve/reject notifications.

**Decisions to confirm**
- Payroll: TDS/income-tax in scope? overtime policy? leave accrual (annual grant vs monthly)?
- Task scope: keep "team" = department, or switch to reporting line?

## Workflow caveats (Windows)
- Dev server runs on **port 3000**; a 2nd `next dev` is blocked by Next's single-server guard.
- **Renaming an exported symbol** trips a Turbopack stale-module error → **restart the dev server** after such changes.
- `prisma generate` may hit a harmless `EPERM` (engine DLL locked by the running dev server) but **types still update**; restart the dev server to load the new client at runtime.
- Schema changes need `npm run db:push` then a dev-server restart. **Never `db:seed`** — the Supabase DB is shared and holds real data.
