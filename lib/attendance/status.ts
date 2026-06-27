import "server-only";
import { prisma } from "@/lib/db";
import { dateAtUTC, nowInZone } from "@/lib/dates";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Employee ids with an approved (HR-approved) leave covering the given date. */
export async function approvedLeaveEmployeeIds(
  companyId: string,
  dateISO: string,
): Promise<Set<string>> {
  const date = dateAtUTC(dateISO);
  const rows = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      kind: "LEAVE",
      status: "HR_APPROVED",
      startDate: { lte: date },
      endDate: { gte: date },
    },
    select: { employeeId: true },
  });
  return new Set(rows.map((r) => r.employeeId));
}

export async function holidayName(
  companyId: string,
  dateISO: string,
): Promise<string | null> {
  const h = await prisma.holiday.findFirst({
    where: { companyId, date: dateAtUTC(dateISO), deletedAt: null },
    select: { name: true },
  });
  return h?.name ?? null;
}

/**
 * Names of employees who, as of now (company tz), are past their shift's
 * start+grace today and still haven't clocked in — excluding approved leave and
 * holidays. Mirrors the attendance page's "late" rule so a cron job can notify
 * proactively instead of waiting for someone to open the attendance page.
 */
export async function lateLoginNames(
  companyId: string,
  tz: string,
): Promise<{ dateISO: string; names: string[] }> {
  const nowZ = nowInZone(tz);
  const dateISO = nowZ.dateISO;
  const nowMin = toMin(nowZ.time);

  const [employees, records, leaveIds, holiday] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, workShift: { select: { startTime: true, graceMinutes: true } } },
    }),
    prisma.attendance.findMany({
      where: { companyId, date: dateAtUTC(dateISO) },
      select: { employeeId: true, clockIn: true },
    }),
    approvedLeaveEmployeeIds(companyId, dateISO),
    holidayName(companyId, dateISO),
  ]);
  if (holiday !== null) return { dateISO, names: [] };

  const clockedIn = new Set(records.filter((r) => r.clockIn).map((r) => r.employeeId));
  const names: string[] = [];
  for (const e of employees) {
    if (leaveIds.has(e.id) || clockedIn.has(e.id)) continue;
    const cutoff = e.workShift ? toMin(e.workShift.startTime) + e.workShift.graceMinutes : null;
    if (cutoff !== null && nowMin > cutoff) names.push(e.fullName);
  }
  return { dateISO, names };
}
