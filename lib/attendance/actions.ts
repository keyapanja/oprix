"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AttendanceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { dateAtUTC, combineDateTimeUTC } from "@/lib/dates";

export type AttendanceState = { error?: string; ok?: boolean };

const MarkSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.nativeEnum(AttendanceType).optional(),
  clockIn: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  clockOut: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
});

export async function markAttendance(input: {
  employeeId: string;
  date: string;
  type?: AttendanceType;
  clockIn?: string;
  clockOut?: string;
}): Promise<AttendanceState> {
  const session = await requireCapability("attendance:manage");
  const parsed = MarkSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  const d = parsed.data;

  // Tenant safety: the employee must belong to this company.
  const emp = await prisma.employee.findFirst({
    where: { id: d.employeeId, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!emp) return { error: "Employee not found" };

  const date = dateAtUTC(d.date);
  const clockIn = d.clockIn ? combineDateTimeUTC(d.date, d.clockIn) : undefined;
  const clockOut = d.clockOut ? combineDateTimeUTC(d.date, d.clockOut) : undefined;

  await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: d.employeeId, date } },
    create: {
      companyId: session.companyId,
      employeeId: d.employeeId,
      date,
      type: d.type ?? "PRESENT",
      // A status click is an explicit override; a clock-only edit is not.
      markedManually: !!d.type,
      clockIn: clockIn ?? null,
      clockOut: clockOut ?? null,
    },
    update: {
      ...(d.type ? { type: d.type, markedManually: true } : {}),
      ...(d.clockIn !== undefined ? { clockIn: clockIn ?? null } : {}),
      ...(d.clockOut !== undefined ? { clockOut: clockOut ?? null } : {}),
    },
  });

  revalidatePath("/attendance");
  return { ok: true };
}

/** Clear a day's attendance for an employee (punch in/out + status) so it can be re-tested. */
export async function resetAttendance(input: {
  employeeId: string;
  date: string;
}): Promise<AttendanceState> {
  const session = await requireCapability("attendance:manage");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Invalid date" };

  const emp = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!emp) return { error: "Employee not found" };

  const rec = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: input.employeeId, date: dateAtUTC(input.date) } },
    select: { id: true },
  });
  if (rec) {
    await prisma.attendanceBreak.deleteMany({ where: { attendanceId: rec.id } });
    await prisma.attendance.delete({ where: { id: rec.id } });
  }

  revalidatePath("/attendance");
  return { ok: true };
}
