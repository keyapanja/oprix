# Oprix — Build Status Snapshot

Compact current-state reference. See **`docs/REFERENCE.md`** for local setup,
architecture & design rationale, the build roadmap, and the companion-extension
design. Day-to-day extension load/use is in `extension/README.md`.
_Last updated: 2026-06-27 — **Leave rework**: apply form moved to its own page (`/leave/apply`), split from the applied-leaves list (`/leave`); **every leave row opens a detail popup** (reason, applied-on, status); **edit-request approval workflow** — applicant (or manager) proposes a change stored in `LeaveRequest.pendingEdit` (JSON) that does NOT alter the live request until an approver **Approves**/**Rejects** it (needs `db push` for `pendingEdit` + `editRequestedAt`). Calendar **apply-leave/WFH removed** (disabled via `canApplyLeave = false`; code kept). Earlier 2026-06-17 — **Pre-launch hardening pass**: multi-assignee timer finalization, leave overlap/balance guards, overnight punch-out fix, extension CORS fail-closed + login rate-limit, deactivated-user redirect-loop fix (`/logout` route), email case-insensitivity + `User.email` sync, JWT alg pin, dead-code removal. Plus project changes: `Project.type` (one-time/recurring, recurring hides progress), create-time asset upload, 2-column detail, **Kanban board removed**, deleted-announcement page. Code-only — `tsc` green, no `db:push`. Earlier (2026-06-16 pm): **Services are now categories → sub-categories** (`Service.parentId`): projects link categories, tasks pick a sub-category (which seeds the checklist), and **task assignees are scoped to the sub-category's department** (per-service "primary assignee" removed). Task creation gained a **description** + **file attachments stored on disk** (`uploads/`, served via `/api/files/[id]`, never in the DB). Data migrated (existing services → sub-categories under per-dept "General"; project links repointed to categories). `tsc` green. Earlier same day: Companion extension + `/api/ext/v1`; Resource Allocation frontend removed._

## Stack (as built)
- **Next.js 16** (App Router, Turbopack) · **TypeScript** strict · **Tailwind v4**
- **Prisma 6.19.3** (pinned — Prisma 7 moved DB URLs to a config file) · **PostgreSQL on Supabase**
  - **DB in Mumbai (`aws-1-ap-south-1`). Runtime = SESSION pooler on port 5432; migrations = the true direct connection (`DIRECT_URL` → `db.<ref>.supabase.co:5432`).** Not the 6543 transaction pooler.
  - **Shared DB with real data → `db:push` only, never `db:seed`.**
- **Auth:** hand-rolled `jose` JWT in an httpOnly cookie (not NextAuth) + set-password invite flow. Session carries `userId, companyId, role, email, employeeId, clientId`.
- **Email:** `nodemailer` SMTP — Gmail configured in `.env` and verified sending; falls back to console logging if `SMTP_HOST` is unset.
- **UI:** custom primitives — searchable `Combobox`, themed `DatePicker`, `Modal` + right offcanvas drawer, `Avatar`, and **global `toast` + `confirmDialog`** (themed, replace native `alert()`/`confirm()` app-wide; `<Toaster/>` + `<ConfirmHost/>` mounted in the app shell). Emerald/teal palette; full light + dark theme; collapsible sidebar. Main content max width **1600px**.

## Modules live (build-verified: `tsc` green + `next build` passes)
- **Auth/RBAC** — login, logout, `proxy.ts` route guard (role-aware: CLIENT → `/portal`, staff → app), `/set-password`. Dynamic permissions (`RolePermission`, `lib/auth/permissions.ts`, **Organization → Access** matrix); Super Admin always full.
- **Dashboard** — role-aware; punch in/out card (live timer, shift grace, late flag); greeting adapts to punch state (no "punch in" prompt once the day is done); **personal widgets** — your tasks due today + latest notifications (5, with "view all"). Greeting hour/date are company-tz-aware.
- **Organization** — single **Company** tab (profile + sidebar branding; work shifts [**now editable**], locations, probation, day-before reminder), Departments, **Services (category → sub-category tree)**, Designations, Access matrix, Task access. A category carries the department; sub-categories inherit it and hold the checklist template tasks seed from.
- **Employees** — directory, create/edit, profile, emergency contacts, email invite + resend.
- **User profiles** — `/profile` (self) + `/people/[id]` (Active/Away badge). **Names across the app now link to `/people/[id]`** (monthly attendance, People report, task assignees, comment authors).
- **Attendance** — admin daily grid (status modal, self-log confirm) **plus a monthly register (`/attendance/monthly`)**: employees × days, status-coded (P/A/½/L/H), month nav. Self-service punch, leave sync, holiday banner, late detection → notifications.
- **Leave** — **`/leave/apply` (apply form) is a separate page from `/leave` (applied-leaves list)**; the sidebar/header "Apply for leave" points there. Types (allowance per month/year, editable); self-service apply (live balance + over-balance block, half-day, WFH, Employee→Manager→HR); overlap guard + balance check on self-apply and manager-create; segregation of duties on approval; notifications. **Each leave row (yours, or anyone's for managers) opens a detail popup** with the full reason, applied-on time, and status. **Edit-request approval** (`LeaveRequest.pendingEdit` JSON + `editRequestedAt`): the applicant — or a manager — proposes a change (dates/type/half-day/reason) that does **not** change the live request; an approver **Approves** (applies it, with segregation-of-duties) or **Rejects**; both sides see the pending change meanwhile. Actions: `requestLeaveEdit` / `approveLeaveEdit` / `rejectLeaveEdit`.
- **Calendar** — holidays, who's away, announcements; click/drag to act (**admins only**). **Applying for leave/WFH from the calendar was removed** — people apply at `/leave/apply`; the calendar's apply-leave code is kept but disabled (`canApplyLeave = false` in `app/(app)/calendar/page.tsx`). Announcement fan-out; optional day-before reminders. Announcements are **author-scoped** (`Announcement.authorId`): the poster (or a Super Admin) can edit/delete them.
- **Tasks → Calendar view** — multi-day tasks render as **continuous spanning bars** (Google-Calendar style): per-week lane packing, flat edges at week boundaries, colored by status, "Due" tag on the deadline day, "+N more" overflow.
- **Projects** — list with progress (**recurring projects hide done/total**), create (**pick service categories** + upload assets at creation), **simple task list** (the per-project Kanban/drag board was removed — it conflicted with the timer/auto-status flow), **edit modal** (name/description/priority/**type: one-time vs recurring**/dates + soft-delete), **Service-categories panel**, **Attachments** (on-disk), Deliverables panel. Detail page is a **2-column layout** below the header.
- **Tasks** — review workflow; **List / Calendar** view switcher (`tasks-workspace`); per-row edit/delete; **description + file attachments** (list/download/delete on the detail page); created under a **sub-category** with **department-scoped assignees**; inline assignees + checklist; comments (@-mentions); per-user timers; role-based visibility. `deleteTask` cleans up all child rows **and their on-disk files**.
- **Time tracking** — per-task/user stopwatch, non-destructive pause, global bottom bar.
- **Clients** — list, contacts, project mapping, **edit**, portal-access invite.
- **Payroll (Module 8)** — full v1: per-employee **salary structures**; monthly **runs (DRAFT→LOCKED→PAID)**; **PF / ESI / Professional-Tax** calculators with **company on/off toggles** (`Company.pfEnabled` / `esiEnabled`); **loss-of-pay** from approved unpaid leave (Gross ÷ 30 fixed, excl. Sundays & company holidays, half-day = 0.5); per-run **bonus/deduction adjustments**; **frozen payslip snapshots**; **printable payslips** + employee self-service `/payslips`; payslip-ready notifications on "mark paid". Pure math in `lib/payroll/{config,calc}.ts`; LOP in `lib/payroll/lop.ts`.
- **Knowledge Base** — guides scoped Project → Department → Sub-category; each article is **written content** (hand-rolled WYSIWYG Markdown, XSS-safe) **or an external link** (`KbArticle.externalUrl`; a content-type radio picks which). Link articles **open in a new tab** from the KB list, task "Related guides", and the extension; their own page shows an "Open external resource" button. Change log; task "Related guides" card.
- **Reports** — read-only analytics: Time, Projects, People, Attendance, Leave, **Payroll (`/reports/payroll`)** (salary summary + cost by department). The reports overview doubles as a company dashboard (incl. a **Monthly payroll** KPI). Custom ranges, multi-color charts, XLS/CSV/PDF export.
- **Notifications** — topbar bell → drawer; `/notifications` filterable by category (Tasks/Mentions/Attendance/Leave/Announcements/**Payroll**/Clients/General). Events: task workflow, @-mentions, late login, leave, announcements, deliverables, reminders, **payslip ready**.

### Client Portal (Module 10) — Phase 1 built, client-side walkthrough pending
- Isolated `/portal` segment; proxy confines CLIENT to `/portal/*`; `requirePortal()`; every query scoped to `clientId`. Invites from Clients page; overview + projects (progress-only); approve/request-changes on CLIENT_REVIEW tasks + deliverables; decisions notify the team.
- **Not yet live-verified on the client side** (needs a real CLIENT login). Internal side verified.

### Companion browser extension (new, 2026-06-16) — localhost build
- **`extension/`** — a plain **MV3 extension (no build step)** that docks the
  user's **To Do / In Progress** tasks to a screen edge with a live timer, an
  expandable **checklist** (toggle) + **related KB**, and ▶/⏸/■ controls. Dock
  position (left/right/top/bottom), collapse, on/off, light/dark theme; Shadow-DOM
  isolated (reads nothing from host pages). Load unpacked from `extension/` — see
  `extension/README.md`.
- **First JSON API** — `app/api/ext/v1/**` route handlers (the app was 100%
  Server Actions before). Auth = revocable **bearer token** (`ExtensionToken`,
  SHA-256, 90-day) via a web-authorize connect flow (`/connect-extension` +
  `launchWebAuthFlow`, no password in the extension) or an email+pw fallback.
  `proxy.ts` exempts `/api/ext/*`. Endpoints: `/me`, `/auth/login`,
  `/auth/revoke`, `/tasks/active`, `/tasks/[id]/timer`, `/checklist/[itemId]`.
  Timer/checklist logic is shared with the web via session-agnostic cores
  (`lib/timer/core.ts`, `lib/projects/task-access.ts`). Manage devices at
  `/profile/devices`. **Localhost-first; production is a config swap.** Live
  browser test is the remaining step.

## Key conventions / decisions
- **Multi-tenant**: every tenant row carries `companyId`; all queries scope by it; server actions re-check ownership.
- **No UI libraries** — charts, Markdown renderer, combobox, datepicker, modal, WYSIWYG, toast, confirm dialog all hand-rolled. **Profile avatars + the company logo upload to disk** (reserved `Employee.photoKey` / `Company.logoKey`, served via scoped `/api/people/[id]/avatar` + `/api/org/logo`, route URL stored in the existing `avatarUrl`/`logoUrl` so render sites are unchanged; shared `ImageUpload` component). KB article images remain URL-in-markdown. Avatars fall back to **first+last-name initials**.
- **UI feedback**: use `toast` (`@/components/ui/toast`) + `confirmDialog` (`@/components/ui/confirm`) — never native `alert()`/`confirm()`.
- **Times**: company-local wall-clock; 12-hour display; "today" via company timezone (`nowInZone`). **Money**: integer paise.
- **Payroll**: statutory rates live in `lib/payroll/config.ts` (config, not magic numbers); calc is pure; company-level PF/ESI toggles; payslips are immutable frozen snapshots; LOP per-day = Gross ÷ 30.
- **Notifications**: taxonomy/colors/deep-links in `lib/notifications/categories.ts` (isomorphic).
- **Task visibility**: per-role scope (`ALL`/`TEAM`/`OWN`) as `task:scope:*` rows in `RolePermission`.
- **Service hierarchy**: `Service.parentId` self-relation — `null` = category (top-level, carries `departmentId`), set = sub-category (inherits the parent's `departmentId`). **Projects link categories** (`ProjectService` → a category); **tasks carry a sub-category** (`Task.serviceId` → a sub-category) which seeds the checklist and scopes assignees to its department. KB articles attach at the sub-category level. Org "General (Tech)/(Design)" categories were created by migration to re-home pre-hierarchy services.
- **Uploads on disk**: `uploads/` at repo root (gitignored); never store bytes in Postgres. Traversal-guarded keys (`lib/uploads.ts`); serving is auth + company-scoped. `Attachment` is polymorphic (`taskId` OR `projectId`); the `AttachmentsPanel` component is shared, parameterized by upload endpoint.

## Pending / what's left
- **Auth & security:**
  - Forgot-password / self-service reset — **✅ built** (`/forgot-password` → reset email → reuses `/set-password`; rides the existing `setupToken` mechanism, 1-hour expiry, no account enumeration; no schema change).
  - Active-session management — needs a `User.tokenVersion` column ("sign out everywhere") or a `Session` table (per-device list).
  - **SSO / Google — deferred until the site is live** (needs Google OAuth creds + the production redirect URL).
- **Audit trail** for sensitive actions (payroll, permission edits, deletions) + viewer — scoped (extends `ActivityLog`).
- **Data export/import** — bulk employee CSV import, company data export (GDPR/portability), soft-delete recovery (`deletedAt` trash/restore) — scoped.
- **Form Builder** (planned next phase) — drag-drop forms (referral/feedback/onboarding/POSH), JSON storage, form-data reports.
- **File uploads** — **task & project attachments now land on local disk** (`uploads/`, gitignored; `lib/uploads.ts`; POST `/api/tasks/[id]/attachments` + `/api/projects/[id]/attachments`; auth-gated GET `/api/files/[id]`; 100 MB/file cap; `Attachment` carries `taskId` OR `projectId`; bytes never in the DB; shared `AttachmentsPanel` UI). **On a multi-instance host this needs a shared volume or object storage (Supabase Storage / presigned).** Profile avatars + company logo are also on disk now (reserved `photoKey`/`logoKey`). Still unwired elsewhere: employee docs, payslip PDFs, file deliverables.
- **Scheduled jobs / cron** — **✅ endpoint built**: secured `GET/POST /api/cron` (`CRON_SECRET`, proxy-exempt) runs day-before reminders + late-login notices across all companies (`lib/cron/jobs.ts`, idempotent). **Still TODO: wire an external scheduler** (Windows Task Scheduler / system cron / cron-job.org / platform cron) to hit it ~hourly. The lazy page-load triggers remain as a fallback.
- **Timesheet views/approval (Module 7)** — timer creates PENDING `TimeEntry` rows; no approval UI yet.
- **Automated tests** — none (isolation/permission tests especially).
- **Client Portal** — client-side live walkthrough (needs a real CLIENT login).
- **Payroll deferrals:** TDS/income-tax, real PDF-to-storage (printable for now).
- **Resource Allocation** — **frontend pulled (2026-06-16)** at the user's request; **backend scaffold retained** (`lib/resource/{data,actions}.ts` + the `EmployeeCapacity` model). To restore: re-create `app/(app)/resource/page.tsx` (+ a client manager) and re-add the nav entry in `lib/nav.ts`.

## Go-live readiness (2026-06-15)
- **`next build`** was green at 45 routes; now **44** after removing the Resource Allocation page (`/resource`) — source TypeScript clean (`tsc` green; the route-type validator regenerates on the next build). All routes are **dynamic/server-rendered** → deploy to a **Node host** (not static export). The 29 react-hooks lint warnings do **not** block the build.
- **Before flipping live:** set host env vars (`DATABASE_URL`, `DIRECT_URL`, a fresh `AUTH_SECRET`, `SMTP_*`) and **`APP_URL` = the live domain** (invite/reset email links depend on it); clean test artifacts from the shared DB (a June payroll draft run, seeded KB articles, placeholder logo); confirm the company's PF/ESI toggle state (**PF was toggled OFF during LOP testing**).
- **Recommended before real users:** wire the `/api/cron` scheduler; walk the Client Portal client-side end-to-end with a real CLIENT login. (Forgot-password reset is now built.)
- **Pre-launch security pass (2026-06-16):** parallel module audit done; the 🔴 blockers are **fixed** — stored-XSS (KB markdown quote-escape + href; task `finalLink` http(s)-validated at store + `safeHref` at render; uploaded SVG neutralized via CSP `sandbox`+`nosniff` on serve routes + SVG rejected for avatars/logos), leave **self-approval** (can't approve own; HR step ≠ manager), salary-report **over-exposure** (`/reports/payroll` + the payroll KPI now require `payroll:manage`), and **immediate offboarding** (`getSession` re-checks `isActive` + reads current role, so deactivation/role-change apply at once). Remaining 🟡 fast-follow (not blockers): finalize timers on Kanban-move / multi-assignee / unassign; case-insensitive email on login+reset; manager-created leave balance check + duplicate/overlap guard; overnight punch-out; and (before the **extension** ships) CORS fail-closed + `/auth/login` rate-limit.

## Workflow caveats (Windows)
- Dev server on **port 3000**; restart after **schema changes** (`npm run db:push`) and after **renaming/removing an exported symbol** (Turbopack stale-module error). Stop it before `db:push`/`next build` (it holds the engine DLL + `.next` → EPERM).
- Don't panic at a `prisma:error … ConnectionReset (Os 10054)` **burst right after force-killing `next dev`** — it orphans Supabase session-pooler connections; the next server collides until they're reaped (~a minute). Self-heals; pages still 200. Not a connection-string bug.
- Preview tooling: full-page **screenshots often time out** → verify via accessibility/DOM `eval`; viewport **resets narrow on restart** → `preview_resize` ~1680. A server-action form needs `form.requestSubmit()` to submit programmatically (a synthetic submit-button `.click()` won't).
- React **hydration-mismatch warnings** in dev logs are from the **Bitdefender browser extension** (`bis_skin_checked`), not the app.
- Auto-mode classifier **blocks creating external accounts / sending real emails** and **schema migrations on the shared DB without explicit user OK** — those need confirmation.
