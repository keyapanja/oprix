# Punch in / out module — hidden from the frontend (2026-06-17)

The self-service **punch in / out** (attendance clock) was removed from the UI on
2026-06-17. **All backend code, server actions, and database fields were kept
intact** — this is a UI-only removal, so the feature can be restored by re-wiring
the frontend. This file is the record of what existed, what it connected to, and
how to bring it back.

## What it did
Employees clocked in/out from a dashboard card; clocking in marked them Present
for the day, with a shift "grace" window deciding on-time vs late. Base employees
were gated to the dashboard until they punched in. Clock data fed the attendance
grid, an attendance report stat, the profile Active/Away dot, and a daily
"late-login" notification to managers.

---

## Frontend that was REMOVED

### Controls
- **`app/(app)/dashboard/page.tsx`** — removed the punch state query, the
  `<PunchCard>` render, and the "…punch in to start your session" greeting line.
- **`app/(app)/layout.tsx`** — removed the punch-in **gate** (`needsPunchIn` →
  `hasPunchedInToday`, the redirect to `/dashboard`, the `x-pathname`/`headers`
  read) and the `<PunchInBanner>`.

### Connected displays
- **`app/(app)/attendance/page.tsx`** + **`components/attendance/attendance-grid.tsx`**
  — removed the **In / Out** columns, the "self" badge, the "Not logged in" (late)
  badge, and the **Clock in / Clock out** fields in the edit dialog. The admin
  grid is now **status-only** (Present / Absent / Half day / Leave / Holiday).
  Also removed the page's lazy `notifyLateLogins` trigger.
- **`app/(app)/reports/attendance/page.tsx`** — removed the **"Late arrivals"**
  KPI, the per-employee **Late** column, and the `lateMin` computation.
- **`app/(app)/people/[id]/page.tsx`** + **`app/(app)/profile/page.tsx`** —
  removed the **Active / Away** status dot + badge (it meant "clocked in, not
  out"). Avatars no longer take a `status` prop on these pages.

### Setting
- **`components/org/org-tabs.tsx`** + **`components/org/shift-edit.tsx`** —
  removed the work-shift **"Grace (min)"** field and the shifts-table Grace
  column. (Shifts now have name + start + end only; new/edited shifts get
  `graceMinutes = 0`.)

### Dormant component files (kept, not rendered)
`components/attendance/punch-card.tsx` and `components/attendance/punch-banner.tsx`
remain in the repo but are **no longer imported anywhere**, so they never render.
Kept so restoring is just re-adding the imports/usages.

## Connected backend job — PAUSED
- **`lib/cron/jobs.ts`** — the **late-login notice** (cron + the attendance-page
  lazy trigger) is disabled. With punch gone, nobody clocks in, so it would flag
  *everyone* late every day. The `lateLoginNames` / `notifyLateLogins` functions
  themselves are untouched; only the call site in `runDailyJobs` was removed.

## Backend KEPT (dormant — nothing deleted)
- **Server actions:** `lib/attendance/self.ts` (`punchIn`, `punchOut`).
- **Gate/status helpers:** `lib/attendance/gate.ts` (`hasPunchedInToday`),
  `lib/profile/status.ts` (`employeeLiveStatus`), `lib/attendance/status.ts`
  (`lateLoginNames`), `lib/notifications/late.ts` (`notifyLateLogins`).
- **Schema (unchanged):** `Attendance.clockIn` / `clockOut`, `WorkShift.graceMinutes`.
  No migration was run; the columns still exist and accept data.

---

## How to restore
1. **Controls:** re-add `<PunchCard>` to the dashboard (the punch state query +
   subtitle branches) and the `<PunchInBanner>` + the `needsPunchIn`/gate logic +
   `headers` import in `app/(app)/layout.tsx`.
2. **Attendance grid/page:** re-add `clockIn`/`clockOut`/`isLate` to
   `AttendanceRow`, the In/Out columns + self/late badges, the dialog clock
   fields, the `workShift` selects, and the `notifyLateLogins` lazy trigger.
3. **Report:** re-add the `lateMin` helper, the `clockIn`+`workShift` selects, the
   Late KPI + column.
4. **Profile/people:** re-add `employeeLiveStatus` + the `status` Avatar prop and
   Active/Away badge.
5. **Setting:** re-add the "Grace (min)" field to both shift forms + the table column.
6. **Cron:** re-add the `lateLoginNames`/`notifyLateLogins` block in
   `lib/cron/jobs.ts` (`runDailyJobs`).

Git history before this commit has the exact prior code for every item above.
