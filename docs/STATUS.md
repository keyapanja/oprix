# Operix — Build Status Snapshot

Compact current-state reference (compresses the long build session). See
`docs/architecture.md` for rationale and `docs/roadmap.md` for the original plan.

## Stack (as built)
- **Next.js 16** (App Router, Turbopack) · **TypeScript** strict · **Tailwind v4**
- **Prisma 6.19.3** (pinned — Prisma 7 moved DB URLs to a config file) · **PostgreSQL on Supabase**
- **Auth:** hand-rolled `jose` JWT in an httpOnly cookie (not NextAuth) + set-password invite flow
- **Email:** `nodemailer` SMTP (Gmail configured in `.env`); logs to console if unset
- **UI:** custom primitives — searchable `Combobox`, themed `DatePicker`, `Modal` (portaled to body); emerald/teal palette; full **light + dark** theme (`.dark` class, no-flash script)

## Modules live (all build-verified: `tsc` + `next build` green)
- **Auth/RBAC** — login, logout, `proxy.ts` route guard, `/set-password`. **Dynamic permissions**: `RolePermission` table, `lib/auth/permissions.ts` resolves per-company (defaults seed from `lib/auth/can.ts`), **Organization → Access** matrix; Super Admin always full.
- **Dashboard** — role-aware; managers see stats, employees see the **punch in/out** card (live timer, shift **grace time**, late flag).
- **Organization** — departments, teams, **department-wise designations**, work shifts (graceMinutes), **locations** (single/multi toggle), **probation periods**, Access matrix.
- **Employees** — directory, create (auto `EMP###` code), profile, emergency contacts, **email invite + resend**, account status.
- **Attendance** — admin daily grid (search / sort / per-page / pagination), self-service punch, **leave sync** (`markedManually` override), holiday banner, **late detection → notifications** (topbar bell is live).
- **Leave** — types with description + allowance **per month/year**; self-service **apply** (live balance, single-date **half-day**, **WFH** toggle, Employee→Manager→HR approval); adaptive page (employee vs manager).
- **Calendar** — `/calendar` for everyone: holidays, who's away (leave/WFH), announcement titles; **click/drag dates** → modal to apply leave (employee) or add holiday / post announcement (admin).
- **Projects** — list with progress, create, detail with **drag-and-drop Kanban** + list view.
- **Clients** — list, contacts, project mapping.

## Key conventions / decisions
- **Multi-tenant**: every tenant row carries `companyId`; services scope by it.
- **Times**: stored as naive company-local wall-clock; displayed **12-hour**; "today" uses **company timezone** (`nowInZone`).
- **Money**: integer paise (for future payroll).
- **All dropdowns** must be the searchable `Combobox` (see memory).
- **Attendance**: approved leave auto-shows "On leave"; punch records times but stays on leave until admin marks manually (`markedManually`) or leave is cancelled.

## Pending / next options
- **Edit screens** — employees / shifts / leave types have create + delete, no edit yet.
- **Timesheets + Resource Allocation** — now unblocked (projects/tasks exist).
- **Payroll** (Slice 4, India statutory: PF/ESI/PT) · **Client Portal** · **Knowledge Base**.
- **Scheduled late-check** (cron) — currently the late notification only fires when today's attendance page is opened.
- Leave types created before the allowance change have 0 allowance → recreate.

## Workflow caveats (Windows)
- User runs the dev server on **port 3000**; a 2nd `next dev` is blocked by Next's single-server guard → changes are **verified via `next build`**, the user tests in-browser.
- `prisma generate` hits a harmless `EPERM` (engine DLL locked by the running dev server) but the generated **types still update**, so builds pass; restart the dev server to load new client at runtime.
- Schema changes need `npm run db:push` then a dev-server restart.
