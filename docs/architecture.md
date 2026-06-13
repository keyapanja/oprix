# Operix — Architecture & Foundations

> Unified business-operations platform for service businesses: HR, projects, attendance, payroll, clients, reporting — one system.

This document is the source of truth for *how* Operix is built. The functional spec (what each module does) lives in `Operix.pdf`. The data model lives in `prisma/schema.prisma`. The build order lives in `docs/roadmap.md`.

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | One codebase for UI + API (route handlers / server actions). SSR for dashboards. |
| Language | **TypeScript** (strict) | Type safety across a large domain. |
| Database | **PostgreSQL** | Relational integrity for HR/payroll; strong JSON support for flexible fields. |
| ORM | **Prisma** | Type-safe queries, migrations, single schema file. |
| Auth | **`jose` JWT in an httpOnly cookie** (credentials only) | We only need email/password — no OAuth — so a signed-cookie session is lighter and more predictable than NextAuth on Next 16. Session carries `companyId`, `role`, `employeeId`/`clientId`. Swap in Auth.js later if OAuth/SSO is needed. |
| Validation | **Zod** | Shared validation between client and server. |
| UI | **Tailwind CSS + shadcn/ui** | Fast, consistent dashboard UI. |
| Background jobs | **BullMQ + Redis** (or pg-boss) | Payroll runs, notification fan-out, recurring jobs. |
| Files | **S3-compatible storage** (presigned uploads) | Documents, attachments, payslip PDFs. |
| PDF | **React-PDF / Puppeteer** | Payslip generation. |
| Email | **Resend / SES** | Notification delivery. |

Folder shape (proposed):
```
/app            Next.js routes (grouped by role: (admin), (employee), (client))
/lib            domain logic — services, not in route files
/lib/auth       session, RBAC guards
/lib/payroll    statutory calculators (India)
/prisma         schema.prisma + migrations
/components/ui  shadcn primitives
/docs           this folder
```

**Rule:** business logic lives in `/lib/<domain>`, never inline in route handlers. Routes are thin — auth-check, validate, call service, return.

---

## 2. Multi-tenancy (decided up front, even though multi-company is "future")

Every tenant-owned row carries a **`companyId`**. This is non-negotiable from day one — retrofitting tenant isolation later is a rewrite.

- `Company` is the tenant root.
- A single Prisma middleware (or explicit scoping in every service) injects `where: { companyId }` on every query.
- For MVP, one user belongs to one company. The model already supports many companies, so "Multi-Company Management" (future phase) becomes a UI/session change, not a schema change.

**Guardrail:** no service may query a tenant table without a `companyId` filter. Centralize this so it can't be forgotten.

---

## 3. Authorization (Module 13 is the spine, not a feature)

Six roles with sharply different data access:

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Everything in the company |
| `HR_MANAGER` | Employees, attendance, leave, payroll |
| `PROJECT_MANAGER` | Projects, tasks, timesheets |
| `TEAM_LEAD` | Their team's people & work |
| `EMPLOYEE` | Self-service only (own attendance, leave, timesheet, payslip) |
| `CLIENT` | **Portal only — only their own projects** |

Design:
- Role stored on `User`. MVP uses a **role enum + capability map** (a `can(user, action, resource)` helper), not a full dynamic permission table — simpler, sufficient for 6 roles. The schema leaves room to add a `Permission` table later without breaking changes.
- **Two hard security boundaries** that get extra scrutiny and tests:
  1. A `CLIENT` can never read another client's data, nor any internal HR/payroll data.
  2. An `EMPLOYEE` can only read/write their own attendance, leave, timesheet, and payslip.
- Enforce at the **service layer**, not just the UI. Every list/read query is scoped by both `companyId` and role.

---

## 4. Domain dependency map (drives build order)

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

Reading: **Payroll sits at the bottom of the dependency graph** — it can't be trusted until attendance, leave, and timesheets are solid. **Employee + Org sit at the top** — nothing works until they exist. This is why the roadmap builds out[→]in.

---

## 5. Payroll — India statutory model (highest-risk module)

The spec lists PF, ESI, Professional Tax → India. Payroll is **computed**, never hand-entered, from:
`SalaryStructure + Attendance adjustments + Leave deductions + Overtime + Incentives`.

Statutory rules to encode in `/lib/payroll` (keep rates in config, not code, as they change yearly):
- **PF (EPF):** employee 12% of basic (+ DA); employer 12% (3.67% EPF + 8.33% EPS); wage ceiling configurable (currently ₹15,000).
- **ESI:** employee 0.75%, employer 3.25% of gross; applies below the wage threshold (₹21,000).
- **Professional Tax:** **state-specific slab** — must be a per-state config table, not a constant.
- **TDS / income tax:** out of MVP scope unless required — flag for decision.

**Principles:**
- All money in **integer minor units** (paise), never floats.
- Every payslip stores a **frozen snapshot** of the components and rates used, so a recompute later never silently changes history.
- Payroll runs are **idempotent and reversible** (draft → locked), gated behind a background job.

---

## 6. Cross-cutting concerns

- **Audit log / activity timeline:** spec calls for it on tasks; generalize to an `ActivityLog` table written by services on create/update of key entities.
- **Notifications:** `Notification` rows + delivery channels (in-app, email). Triggered by domain events (task assigned, leave approved, payroll generated, client feedback). Use the job queue for email fan-out.
- **Soft deletes** (`deletedAt`) on people/projects/clients — you rarely truly delete HR records.
- **Timezone:** store all timestamps in UTC; `Company.timezone` drives display and attendance-day boundaries.
- **File uploads:** presigned direct-to-S3; DB stores metadata + key only.

---

## 7. What we are explicitly NOT building (per spec)

Recruitment, Asset Mgmt, Expense Mgmt, Goal Mgmt, Budget Planning, Multi-Company UI, Workflow Builder, AI features. The schema is designed so these slot in later without migrations that break existing data.
