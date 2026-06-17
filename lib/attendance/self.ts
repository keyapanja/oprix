"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getCompanyTimezone } from "@/lib/cache";
import { dateAtUTC, combineDateTimeUTC, nowInZone } from "@/lib/dates";

export type PunchState = { error?: string; ok?: boolean; time?: string };

// Resolves the current employee + their company timezone. Returns null if the
// signed-in user has no linked employee record (e.g. a pure admin login).
async function context() {
  const session = await getSession();
  if (!session?.employeeId) return null;
  return {
    companyId: session.companyId,
    employeeId: session.employeeId,
    tz: await getCompanyTimezone(session.companyId),
  };
}

export async function punchIn(): Promise<PunchState> {
  const ctx = await context();
  if (!ctx) return { error: "No employee profile is linked to your account." };

  const { dateISO, time } = nowInZone(ctx.tz);
  const date = dateAtUTC(dateISO);

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: ctx.employeeId, date } },
    select: { clockIn: true, markedManually: true },
  });
  if (existing?.clockIn) return { error: "You've already punched in today." };

  await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: ctx.employeeId, date } },
    create: {
      companyId: ctx.companyId,
      employeeId: ctx.employeeId,
      date,
      type: "PRESENT",
      clockIn: combineDateTimeUTC(dateISO, time),
    },
    // Don't override an admin's manual status; the calendar/grid keeps them
    // "On leave" if applicable, but the punch time is still recorded.
    update: {
      clockIn: combineDateTimeUTC(dateISO, time),
      ...(existing?.markedManually ? {} : { type: "PRESENT" }),
    },
  });

  revalidatePath("/dashboard");
  return { ok: true, time };
}

export async function punchOut(): Promise<PunchState> {
  const ctx = await context();
  if (!ctx) return { error: "No employee profile is linked to your account." };

  const { dateISO, time } = nowInZone(ctx.tz);

  // Find the OPEN session (punched in, not out). Usually today's row, but for an
  // overnight shift the open row was opened on the previous day — so search by
  // the open state, not just today's date, or punch-out would be unreachable.
  const open = await prisma.attendance.findFirst({
    where: { employeeId: ctx.employeeId, clockIn: { not: null }, clockOut: null },
    orderBy: { date: "desc" },
    select: { id: true },
  });
  if (!open) {
    const todayRow = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: ctx.employeeId, date: dateAtUTC(dateISO) } },
      select: { clockIn: true, clockOut: true },
    });
    if (todayRow?.clockIn && todayRow.clockOut) return { error: "You've already punched out." };
    return { error: "Punch in first." };
  }

  await prisma.attendance.update({
    where: { id: open.id },
    data: { clockOut: combineDateTimeUTC(dateISO, time) },
  });

  revalidatePath("/dashboard");
  return { ok: true, time };
}
