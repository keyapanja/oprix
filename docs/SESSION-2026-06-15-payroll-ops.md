# Operix — Session Handoff (2026-06-15, Payroll + Ops + Themed Dialogs)

Detailed change log + resume context for the session that built the **Payroll
module**, a batch of **ops features** (Resource Allocation, monthly attendance,
task dependencies/milestones, edit screens, payroll report, task calendar,
profile links), and an **app-wide themed toast + confirm-dialog** system. Also
recovered the project's GitHub state and tuned the DB connection. Read this +
`docs/STATUS.md` to pick up cold. (The earlier `docs/SESSION-2026-06-15.md` is
the *previous* session — KB, Client Portal Phase 1, UX/notifications.)

---

## 0. Quick start (resume checklist)
- **Dev server:** `npm run dev` (port 3000). Stop it before `npm run db:push` **or `npm run build`** (it holds the Prisma engine DLL + `.next` → EPERM on Windows), then restart.
- **Build:** source `tsc` is **clean**. `next build` was green at **45 routes**; **44** after the Resource Allocation page was removed 2026-06-16 (the route-type validator under `.next/types` regenerates on the next build). All routes are dynamic/server-rendered → deploy to a Node host.
- **DB:** Supabase **Mumbai**, **session pooler :5432** for runtime (`DATABASE_URL`), true direct connection for migrations (`DIRECT_URL`). `db:push` only — shared real data.
- **Admin login:** `admin@operix.test` / `ChangeMe123!` (Super Admin, no linked Employee). Employees: Keya (`keya@gowithepic.com`, EMP001), Suman (EMP002).
- **UI feedback:** use `toast` (`@/components/ui/toast`) + `confirmDialog` (`@/components/ui/confirm`) — never native `alert()`/`confirm()`.
- **Verify** via the preview MCP `eval`/`logs`/`snapshot` (screenshots time out; a server-action form needs `form.requestSubmit()` to submit programmatically).

---

## 1. What this session delivered

### DB connection (tuned)
- `.env` runtime `DATABASE_URL` switched to the **session pooler :5432** (was the 6543 transaction pooler) to match `docs/STATUS.md`'s tuned setup; `DIRECT_URL` left as the true direct connection (correct for migrations). Both verified connecting.

### Payroll (Module 8) — full v1, DONE & verified
Schema (`SalaryStructure`, `PayrollRun`, `Payslip`, `ProfessionalTaxSlab`, `PayrollRunStatus`) already existed — this session wrote all the code.
- `lib/payroll/config.ts` — India FY25-26 statutory rates/ceilings (PF 12% capped at ₹15k wage; ESI 0.75%/3.25% only when gross ≤ ₹21k) + **`lop.divisorDays: 30`**. Rates as config, not magic numbers.
- `lib/payroll/calc.ts` — **pure** PF/ESI/PT + `computePayslip()` (money in paise; statutory rounded to rupee). Takes `StatutoryFlags` (PF/ESI on/off) and a `LopInput`.
- `lib/payroll/lop.ts` — `computeLop()`: loss-of-pay from **approved UNPAID leave** only (paid leave is entitlement-covered, enforced at apply time), excluding **Sundays + company holidays**, half-day = 0.5. Per-day = **Gross ÷ 30 (fixed)**.
- `lib/payroll/data.ts` (scoped reads) + `lib/payroll/actions.ts` (server actions).
- Pages: `app/(app)/payroll/{page,[runId],salaries,settings}` (admin, `payroll:manage`) + `app/(app)/payslips/{page,[id]}` (self-service + printable, owner-or-manager).
- Run lifecycle **DRAFT → LOCKED → PAID**. `processPayrollRun` generates a payslip per active employee with an active salary structure (idempotent — delete a slip + reprocess to regenerate). Lock freezes; **mark-paid notifies each employee** (`PAYROLL_PAID`, `meta.payslipId` → `/payslips/[id]`). Per-run **bonus + one-off deduction** via `adjustPayslip` (codes `BONUS`/`OTHER`). Payslip stores frozen `earnings`/`deductions`/`ratesSnapshot` JSON.
- **Company PF/ESI toggles** (`Company.pfEnabled`/`esiEnabled`, Payroll → Settings): off → that statutory component is skipped, so a firm with no PF/ESI gets **net = gross = Basic**. PT from `ProfessionalTaxSlab` (₹0 until slabs are added).
- Fix: deleting a draft run navigates to `/payroll` (was 404'ing on the deleted page).

### App-wide themed toast + confirm dialog
- `components/ui/toast.tsx` (global `toast.success/error/info`, module pub/sub, `<Toaster/>`) and `components/ui/confirm.tsx` (`confirmDialog({...})` promise-based modal, `<ConfirmHost/>`). Both mounted in `app/(app)/layout.tsx`.
- Swept **~25 files**: 35 native `alert()` → `toast.error`, 12 `confirm()`/`window.confirm()` → `await confirmDialog(...)` (handlers made `async`). `confirmDialog` is named (not `confirm`) so it never shadows the native global.

### Ops features (this batch)
- **Resource Allocation** — built as `lib/resource/{data,actions}.ts` + a page + client manager. Capacity (working days × hours/day from `EmployeeCapacity`, editable) vs logged hours + active tasks → utilization. **⚠ Frontend removed 2026-06-16** (user request): deleted `app/(app)/resource/page.tsx`, `components/resource/allocation-manager.tsx`, and the `lib/nav.ts` entry — no longer reachable in the UI or by URL. **Backend kept** (`lib/resource/{data,actions}.ts`, the `EmployeeCapacity` model, and a now-dormant `revalidatePath("/resource")`) for a future revival.
- **Monthly attendance register** — `lib/attendance/monthly.ts` + `app/(app)/attendance/monthly/page.tsx` (employees × days grid, reuses `effectiveStatus`). Linked from the daily attendance page header.
- **Edit screens** — `updateShift`/`updateLeaveType`/`updateClient` actions + `components/org/shift-edit.tsx`, `components/leave/type-edit.tsx`, `components/clients/client-edit.tsx` (modal forms wired beside the existing delete buttons).
- **Task dependencies + milestones** — `addTaskDependency`/`removeTaskDependency`/`createMilestone`/`deleteMilestone`/`setTaskMilestone` in `lib/projects/actions.ts`; `components/tasks/task-dependencies.tsx` + `task-milestone.tsx` on the task page; `components/projects/milestones-panel.tsx` on the project page.
- **Payroll report** — `app/(app)/reports/payroll/page.tsx` (salary summary + cost by department + export) + a **Monthly payroll** KPI added to the reports overview dashboard. Nav child added.
- **Task views** — `components/tasks/tasks-workspace.tsx` adds a **List / Calendar** switcher; `task-calendar.tsx` (month grid by due date). *A Timeline (Gantt) view was added then removed at the user's request as low-usability.*
- **Profile links** — names link to `/people/[id]` in Resource Allocation, monthly attendance, the People report, task assignees, and comment authors.
- Fix: hide the sidebar "Coming soon" label when `NAV_SOON` is empty.

---

## 2. Schema changes this session (pushed via `db:push`)
- `Company` += `pfEnabled Boolean @default(true)`, `esiEnabled Boolean @default(true)` — payroll statutory toggles. **(Only schema change this session — everything else reused existing tables.)**

---

## 3. Scoped but NOT built (verified specs ready)
A scoping workflow (14 agents, adversarially verified) produced concrete plans for the next auth/audit/data batch. Highlights:
- **Forgot-password / self-service reset** — **no schema change**; reuses `User.setupToken`/`setupTokenExpiresAt` + the `/set-password` page + SMTP. Use a short (≈1h) token expiry and a neutral anti-enumeration response. *Recommended before launch.*
- **Active-session management** — stateless JWT can't be listed/revoked without server state: add `User.tokenVersion` ("sign out everywhere", cheap) or a `Session` table (per-device list). Schema change either way.
- **SSO / Google** — deferred until live (needs Google OAuth client id/secret + the production redirect URI). Plan: hand-rolled OAuth code flow + a callback route; decision = link-to-existing-by-email vs auto-provision (+ optional domain restriction).
- **Audit trail** — extend `ActivityLog` to log payroll/permission/delete actions + a viewer page (decide on a before/after-diff field + an audit capability).
- **Data export/import** — employee CSV import (paste/`FileReader`, no storage needed), company JSON/CSV export via a Route Handler (exclude password hashes/tokens), soft-delete trash/restore (`deletedAt` exists on Employee/Project/Client).

---

## 4. Go-live readiness
- `next build` green at 45 routes (**44** after the Resource Allocation removal; source `tsc` clean). **Before live:** host env vars + **`APP_URL` = live domain** (email links); clean test data; confirm PF/ESI toggle state (**PF currently OFF** from testing). **Recommended pre-launch:** forgot-password reset + a Client Portal client-side walkthrough.

---

## 5. Test artifacts left in the DB (clean up before real users)
- A **June 2026 draft payroll run** + payslips (built on the test salaries set during verification).
- From the prior session: KB "Audit Report" articles, a deliverable on "401k Manuever", a Jun-20 announcement, placeholder company logo/avatar.
- Salaries were set for Keya + Suman during payroll testing.

---

## 6. Known limitations / pending
See `docs/STATUS.md` → "Pending / what's left" and "Go-live readiness". Top items: file uploads (Supabase Storage) unwired; no real cron (lazy reminders); Timesheet approval UI; automated tests; Client Portal client-side unverified; Payroll TDS + real PDF-to-storage deferred.

---

## 7. Standing context / next
- **Form Builder** remains the named "next phase" (drag-drop forms; don't build yet; keep portal/scoping modular).
- Reusable patterns added this session: global `toast`/`confirmDialog`; pure payroll calc + frozen payslip snapshots; the reports toolkit (`KpiGrid`/`Section`/`BarList`/`RangeFilter`/`resolveWindow`) is the template for any analytics page.
