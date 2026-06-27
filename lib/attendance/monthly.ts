import "server-only";
import type { AttendanceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { daysInMonth } from "@/lib/dates";
import { effectiveStatus } from "@/lib/attendance/resolve";

export type DayCell = { day: number; status: AttendanceType | null; isSunday: boolean; isHoliday: boolean };
export type MonthlyRow = {
  id: string;
  name: string;
  code: string;
  dept: string;
  cells: DayCell[];
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
};
export type MonthlyData = { rows: MonthlyRow[]; dim: number };

/** Attendance register for a month: per-employee per-day effective status. */
export async function getMonthlyAttendance(companyId: string, year: number, month: number): Promise<MonthlyData> {
  const dim = daysInMonth(year, month - 1);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month - 1, dim));
  const win = { gte: first, lte: last };

  const [employees, records, holidays, leaves] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } },
    }),
    prisma.attendance.findMany({ where: { companyId, date: win }, select: { employeeId: true, date: true, type: true, markedManually: true } }),
    prisma.holiday.findMany({ where: { companyId, date: win, deletedAt: null }, select: { date: true } }),
    prisma.leaveRequest.findMany({
      where: { companyId, kind: "LEAVE", status: "HR_APPROVED", startDate: { lte: last }, endDate: { gte: first } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);

  const recMap = new Map<string, { type: AttendanceType; markedManually: boolean }>();
  for (const r of records) recMap.set(`${r.employeeId}:${r.date.getUTCDate()}`, { type: r.type, markedManually: r.markedManually });

  const holidayDays = new Set<number>(holidays.map((h) => h.date.getUTCDate()));

  const leaveMap = new Map<string, Set<number>>();
  for (const lv of leaves) {
    const s = lv.startDate.getTime() > first.getTime() ? lv.startDate : first;
    const e = lv.endDate.getTime() < last.getTime() ? lv.endDate : last;
    let set = leaveMap.get(lv.employeeId);
    if (!set) { set = new Set(); leaveMap.set(lv.employeeId, set); }
    const d = new Date(s.getTime());
    while (d.getTime() <= e.getTime()) { set.add(d.getUTCDate()); d.setUTCDate(d.getUTCDate() + 1); }
  }

  const rows: MonthlyRow[] = employees.map((emp) => {
    const leaveSet = leaveMap.get(emp.id);
    const cells: DayCell[] = [];
    let present = 0, absent = 0, halfDay = 0, leave = 0;
    for (let day = 1; day <= dim; day++) {
      const isSunday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
      const isHoliday = holidayDays.has(day);
      const rec = recMap.get(`${emp.id}:${day}`);
      const status = effectiveStatus({
        recordType: rec?.type ?? null,
        markedManually: rec?.markedManually ?? false,
        onLeave: leaveSet?.has(day) ?? false,
        holiday: isHoliday,
      });
      if (status === "PRESENT") present++;
      else if (status === "ABSENT") absent++;
      else if (status === "HALF_DAY") halfDay++;
      else if (status === "LEAVE") leave++;
      cells.push({ day, status, isSunday, isHoliday });
    }
    return { id: emp.id, name: emp.fullName, code: emp.employeeCode, dept: emp.department?.name ?? "—", cells, present, absent, halfDay, leave };
  });

  return { rows, dim };
}
