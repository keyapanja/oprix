import "server-only";
import { prisma } from "@/lib/db";
import { daysInMonth } from "@/lib/dates";
import { PAYROLL_CONFIG } from "./config";

// Loss-of-pay for a month, derived from approved UNPAID leave (per the agreed
// policy: absences are recorded as leave; paid leave is covered by entitlement,
// which the apply flow already enforces). Sundays and company holidays inside a
// leave span are paid and excluded. Half-day leave counts as 0.5.
// Per-day value uses a FIXED 30-day divisor (PAYROLL_CONFIG.lop.divisorDays) —
// the calendar length of the month only bounds which leave days count.

export type LopResult = { days: number; divisorDays: number };

// Final-approved leave states (the leave flow ends at HR_APPROVED; APPROVED is
// the generic single-step terminal state).
const APPROVED_STATES = ["HR_APPROVED", "APPROVED"] as const;

export async function computeLop(
  companyId: string,
  employeeId: string,
  year: number,
  month: number, // 1-12
): Promise<LopResult> {
  const divisorDays = PAYROLL_CONFIG.lop.divisorDays;
  const dim = daysInMonth(year, month - 1); // actual calendar length — bounds the month
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month - 1, dim));

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      employeeId,
      kind: "LEAVE",
      status: { in: [...APPROVED_STATES] },
      leaveType: { paidType: "UNPAID" },
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
    select: { startDate: true, endDate: true, isHalfDay: true },
  });
  if (leaves.length === 0) return { days: 0, divisorDays };

  const holidays = await prisma.holiday.findMany({
    where: { companyId, date: { gte: monthStart, lte: monthEnd }, deletedAt: null },
    select: { date: true },
  });
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  let lopDays = 0;
  for (const lv of leaves) {
    const start = lv.startDate.getTime() > monthStart.getTime() ? lv.startDate : monthStart;
    const end = lv.endDate.getTime() < monthEnd.getTime() ? lv.endDate : monthEnd;

    let working = 0;
    const d = new Date(start.getTime());
    while (d.getTime() <= end.getTime()) {
      const isSunday = d.getUTCDay() === 0; // weekly off
      const iso = d.toISOString().slice(0, 10);
      if (!isSunday && !holidaySet.has(iso)) working += 1;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    if (working === 0) continue;
    // A half-day request is a single working day counted at 0.5.
    lopDays += lv.isHalfDay && working === 1 ? 0.5 : working;
  }

  return { days: lopDays, divisorDays };
}
