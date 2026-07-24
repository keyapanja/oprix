import "server-only";
import type { AllowancePeriod } from "@prisma/client";
import { prisma } from "@/lib/db";

export type LeaveBalance = {
  typeId: string;
  name: string;
  description: string | null;
  allowance: number;
  used: number;
  remaining: number;
  period: AllowancePeriod;
  unlimited: boolean;
  attachmentEnabled: boolean;
};

// Current month or current year, as a [start, end) UTC range.
function periodRange(period: AllowancePeriod): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getUTCFullYear();
  if (period === "MONTH") {
    const m = now.getUTCMonth();
    return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
  }
  return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)) };
}

async function usedDays(
  companyId: string,
  employeeId: string,
  typeId: string,
  period: AllowancePeriod,
): Promise<number> {
  const { start, end } = periodRange(period);
  const agg = await prisma.leaveRequest.aggregate({
    where: {
      companyId,
      employeeId,
      leaveTypeId: typeId,
      kind: "LEAVE",
      status: { not: "REJECTED" },
      startDate: { gte: start, lt: end },
    },
    _sum: { days: true },
  });
  return agg._sum.days ?? 0;
}

/** Per-type balances for an employee, for the current period of each type. */
export async function computeBalances(
  companyId: string,
  employeeId: string,
): Promise<LeaveBalance[]> {
  const types = await prisma.leaveType.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      allowanceValue: true,
      allowancePeriod: true,
      unlimited: true,
      attachmentEnabled: true,
    },
  });

  const out: LeaveBalance[] = [];
  for (const t of types) {
    const used = await usedDays(companyId, employeeId, t.id, t.allowancePeriod);
    out.push({
      typeId: t.id,
      name: t.name,
      description: t.description,
      allowance: t.allowanceValue,
      used,
      // Can go negative when more was taken than allowed (e.g. imported history) —
      // shown as a red minus balance. The apply/approve guard clamps separately.
      remaining: t.allowanceValue - used,
      period: t.allowancePeriod,
      unlimited: t.unlimited,
      attachmentEnabled: t.attachmentEnabled,
    });
  }
  return out;
}

export async function remainingForType(
  companyId: string,
  employeeId: string,
  typeId: string,
): Promise<number | null> {
  const t = await prisma.leaveType.findFirst({
    where: { id: typeId, companyId },
    select: { allowanceValue: true, allowancePeriod: true, unlimited: true },
  });
  if (!t) return null;
  if (t.unlimited) return Number.POSITIVE_INFINITY; // no fixed cap — apply freely
  const used = await usedDays(companyId, employeeId, typeId, t.allowancePeriod);
  return Math.max(0, t.allowanceValue - used);
}
