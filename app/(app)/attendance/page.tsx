import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { nowInZone, dateAtUTC, timeHHMM } from "@/lib/dates";
import { effectiveStatus } from "@/lib/attendance/resolve";
import { approvedLeaveEmployeeIds, holidayName } from "@/lib/attendance/status";
import { notifyLateLogins } from "@/lib/notifications/late";
import { PageHeader } from "@/components/ui/page-header";
import { DateNav } from "@/components/attendance/date-nav";
import { AttendanceGrid, type AttendanceRow } from "@/components/attendance/attendance-grid";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Attendance · Operix" };

const SUMMARY = [
  { key: "PRESENT", label: "Present", dot: "bg-emerald-500" },
  { key: "ABSENT", label: "Absent", dot: "bg-red-500" },
  { key: "HALF_DAY", label: "Half day", dot: "bg-amber-500" },
  { key: "LEAVE", label: "On leave", dot: "bg-brand-500" },
  { key: "HOLIDAY", label: "Holiday", dot: "bg-slate-400" },
] as const;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requirePage("attendance:manage");
  const sp = await searchParams;
  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { timezone: true },
  });
  const tz = company?.timezone ?? "Asia/Kolkata";
  const nowZ = nowInZone(tz);
  const today = nowZ.dateISO;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const isToday = date === today;

  const [employees, records, leaveIds, holiday] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        department: { select: { name: true } },
        workShift: { select: { startTime: true, graceMinutes: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { companyId: session.companyId, date: dateAtUTC(date) },
      select: { employeeId: true, type: true, markedManually: true, clockIn: true, clockOut: true },
    }),
    approvedLeaveEmployeeIds(session.companyId, date),
    holidayName(session.companyId, date),
  ]);

  const isHoliday = holiday !== null;
  const byEmp = new Map(records.map((r) => [r.employeeId, r]));
  const nowMin = toMin(nowZ.time);

  const rows: AttendanceRow[] = [];
  const counts: Record<string, number> = {};
  let unmarked = 0;
  const lateNames: string[] = [];

  for (const e of employees) {
    const rec = byEmp.get(e.id);
    const onLeave = leaveIds.has(e.id);
    const clockIn = timeHHMM(rec?.clockIn);

    const cutoff = e.workShift ? toMin(e.workShift.startTime) + e.workShift.graceMinutes : null;
    const isLate =
      isToday && !onLeave && !isHoliday && !rec?.clockIn && cutoff !== null && nowMin > cutoff;

    rows.push({
      employeeId: e.id,
      name: e.fullName,
      code: e.employeeCode,
      dept: e.department?.name ?? "—",
      recordType: rec?.type ?? null,
      markedManually: rec?.markedManually ?? false,
      onLeave,
      isLate,
      clockIn,
      clockOut: timeHHMM(rec?.clockOut),
    });

    const eff = effectiveStatus({
      recordType: rec?.type ?? null,
      markedManually: rec?.markedManually ?? false,
      onLeave,
      holiday: isHoliday,
    });
    if (eff) counts[eff] = (counts[eff] ?? 0) + 1;
    else unmarked++;
    if (isLate) lateNames.push(e.fullName);
  }

  // Lazy trigger: notify attendance managers about who hasn't logged in today.
  if (isToday && lateNames.length > 0) {
    try {
      await notifyLateLogins(session.companyId, date, lateNames);
    } catch {
      /* never break the page on notification failure */
    }
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Mark and track daily attendance."
        action={
          <Link href="/attendance/monthly">
            <Button variant="secondary" size="sm">
              <Icon name="calendar" className="size-4" />
              Monthly view
            </Button>
          </Link>
        }
      />
      <DateNav date={date} today={today} />

      {isHoliday && (
        <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25">
          🎉 {holiday} — company holiday
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SUMMARY.map((s) => (
          <div key={s.key} className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${s.dot}`} />
              <span className="text-xs font-medium text-muted">{s.label}</span>
            </div>
            <p className="font-display mt-1 text-2xl font-bold text-content">{counts[s.key] ?? 0}</p>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-faint" />
            <span className="text-xs font-medium text-muted">Unmarked</span>
          </div>
          <p className="font-display mt-1 text-2xl font-bold text-content">{unmarked}</p>
        </div>
      </div>

      <AttendanceGrid date={date} holiday={isHoliday} rows={rows} />
    </>
  );
}
