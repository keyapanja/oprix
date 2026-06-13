import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { nowInZone, dateAtUTC, timeHHMM } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { DateNav } from "@/components/attendance/date-nav";
import { AttendanceGrid, type AttendanceRow } from "@/components/attendance/attendance-grid";

export const metadata: Metadata = { title: "Attendance · Operix" };

const SUMMARY = [
  { key: "PRESENT", label: "Present", dot: "bg-emerald-500" },
  { key: "ABSENT", label: "Absent", dot: "bg-red-500" },
  { key: "HALF_DAY", label: "Half day", dot: "bg-amber-500" },
  { key: "LEAVE", label: "On leave", dot: "bg-brand-500" },
  { key: "HOLIDAY", label: "Holiday", dot: "bg-slate-400" },
] as const;

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
  const today = nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO;
  const date =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const [employees, records] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        department: { select: { name: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { companyId: session.companyId, date: dateAtUTC(date) },
      select: { employeeId: true, type: true, clockIn: true, clockOut: true },
    }),
  ]);

  const byEmp = new Map(records.map((r) => [r.employeeId, r]));
  const rows: AttendanceRow[] = employees.map((e) => {
    const a = byEmp.get(e.id);
    return {
      employeeId: e.id,
      name: e.fullName,
      code: e.employeeCode,
      dept: e.department?.name ?? "—",
      type: a?.type ?? null,
      clockIn: timeHHMM(a?.clockIn),
      clockOut: timeHHMM(a?.clockOut),
    };
  });

  const counts: Record<string, number> = {};
  for (const r of records) counts[r.type] = (counts[r.type] ?? 0) + 1;
  const unmarked = employees.length - records.length;

  return (
    <>
      <PageHeader title="Attendance" description="Mark and track daily attendance." />
      <DateNav date={date} today={today} />

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

      <AttendanceGrid date={date} rows={rows} />
    </>
  );
}
