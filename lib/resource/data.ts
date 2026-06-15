import "server-only";
import { prisma } from "@/lib/db";
import { dateAtUTC } from "@/lib/dates";

// Resource allocation = capacity (working days × daily hours) vs logged hours
// and active task load, per employee, for a date window. Capacity defaults match
// EmployeeCapacity defaults (8h/day) until an admin sets a per-person value.

const DEFAULT = { dailyHours: 8, weeklyHours: 40, monthlyHours: 160 };

export type AllocationRow = {
  id: string;
  name: string;
  dept: string;
  role: string;
  dailyHours: number;
  weeklyHours: number;
  monthlyHours: number;
  hasCapacityRow: boolean;
  capacityHours: number;
  loggedHours: number;
  activeTasks: number;
  utilization: number; // loggedHours / capacityHours (0..>1)
};

/** Working days in [start,end] excluding Sundays and company holidays. */
function workingDays(startISO: string, endISO: string, holidaySet: Set<string>): number {
  let n = 0;
  const d = new Date(`${startISO}T00:00:00.000Z`);
  const end = new Date(`${endISO}T00:00:00.000Z`);
  let guard = 0;
  while (d.getTime() <= end.getTime() && guard++ < 1000) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && !holidaySet.has(iso)) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export async function getAllocation(companyId: string, startISO: string, endISO: string): Promise<AllocationRow[]> {
  const dateWin = { gte: dateAtUTC(startISO), lte: dateAtUTC(endISO) };

  const [employees, holidays] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        department: { select: { name: true } },
        designation: { select: { name: true } },
        capacity: { select: { dailyHours: true, weeklyHours: true, monthlyHours: true } },
      },
    }),
    prisma.holiday.findMany({ where: { companyId, date: dateWin }, select: { date: true } }),
  ]);
  const empIds = employees.map((e) => e.id);

  const [hoursGroups, assignments] = await Promise.all([
    prisma.timeEntry.groupBy({ by: ["employeeId"], where: { companyId, employeeId: { in: empIds }, date: dateWin }, _sum: { hours: true } }),
    prisma.taskAssignee.findMany({ where: { employeeId: { in: empIds }, task: { status: { not: "COMPLETED" } } }, select: { employeeId: true } }),
  ]);

  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const days = workingDays(startISO, endISO, holidaySet);
  const hoursByEmp = new Map(hoursGroups.map((g) => [g.employeeId, g._sum.hours ?? 0]));
  const activeByEmp = new Map<string, number>();
  for (const a of assignments) activeByEmp.set(a.employeeId, (activeByEmp.get(a.employeeId) ?? 0) + 1);

  return employees.map((e) => {
    const daily = e.capacity?.dailyHours ?? DEFAULT.dailyHours;
    const capacityHours = Math.round(daily * days);
    const loggedHours = Math.round((hoursByEmp.get(e.id) ?? 0) * 10) / 10;
    return {
      id: e.id,
      name: e.fullName,
      dept: e.department?.name ?? "—",
      role: e.designation?.name ?? "—",
      dailyHours: daily,
      weeklyHours: e.capacity?.weeklyHours ?? DEFAULT.weeklyHours,
      monthlyHours: e.capacity?.monthlyHours ?? DEFAULT.monthlyHours,
      hasCapacityRow: !!e.capacity,
      capacityHours,
      loggedHours,
      activeTasks: activeByEmp.get(e.id) ?? 0,
      utilization: capacityHours > 0 ? loggedHours / capacityHours : 0,
    };
  });
}
