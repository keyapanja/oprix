import "server-only";
import { prisma } from "@/lib/db";
import { dateAtUTC } from "@/lib/dates";

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
    where: { companyId, date: dateAtUTC(dateISO) },
    select: { name: true },
  });
  return h?.name ?? null;
}
