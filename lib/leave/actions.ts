"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LeavePaidType, AllowancePeriod, RequestKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { remainingForType } from "@/lib/leave/balance";
import { dateAtUTC } from "@/lib/dates";

export type LeaveState = { error?: string; ok?: boolean };
const LEAVE = "/leave";

// ---- Leave types ----------------------------------------------------------
const LeaveTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  paidType: z.nativeEnum(LeavePaidType),
  allowanceValue: z.coerce.number().min(0).max(365),
  allowancePeriod: z.nativeEnum(AllowancePeriod),
});

export async function createLeaveType(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const session = await requireCapability("leave:manage");
  const parsed = LeaveTypeSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    paidType: formData.get("paidType"),
    allowanceValue: formData.get("allowanceValue"),
    allowancePeriod: formData.get("allowancePeriod"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  try {
    await prisma.leaveType.create({
      data: {
        companyId: session.companyId,
        name: d.name,
        description: d.description || null,
        paidType: d.paidType,
        allowanceValue: d.allowanceValue,
        allowancePeriod: d.allowancePeriod,
      },
    });
  } catch {
    return { error: "A leave type with that name already exists" };
  }
  revalidatePath(LEAVE);
  return { ok: true };
}

// ---- Self-service: apply for leave or WFH -------------------------------
const ApplySchema = z.object({
  kind: z.nativeEnum(RequestKind),
  leaveTypeId: z.string().optional().or(z.literal("")),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date is required"),
  isHalfDay: z.string().optional(),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function applyLeave(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const session = await getSession();
  if (!session?.employeeId) {
    return { error: "No employee profile is linked to your account." };
  }
  const parsed = ApplySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const start = dateAtUTC(d.startDate);
  const end = dateAtUTC(d.endDate);
  if (end < start) return { error: "End date can't be before the start date" };

  const singleDay = d.startDate === d.endDate;
  const isHalfDay = singleDay && d.isHalfDay === "on";
  const days = isHalfDay
    ? 0.5
    : Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  let leaveTypeId: string | null = null;
  if (d.kind === "LEAVE") {
    if (!d.leaveTypeId) return { error: "Select a leave type." };
    const remaining = await remainingForType(session.companyId, session.employeeId, d.leaveTypeId);
    if (remaining === null) return { error: "Leave type not found." };
    if (days > remaining) {
      return { error: `Only ${remaining} day(s) left for this leave type.` };
    }
    leaveTypeId = d.leaveTypeId;
  }

  await prisma.leaveRequest.create({
    data: {
      companyId: session.companyId,
      employeeId: session.employeeId,
      kind: d.kind,
      leaveTypeId,
      startDate: start,
      endDate: end,
      days,
      isHalfDay,
      reason: d.reason || null,
      status: "PENDING",
    },
  });
  revalidatePath("/leave");
  return { ok: true };
}

export async function deleteLeaveType(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:manage");
  try {
    await prisma.leaveType.deleteMany({ where: { id, companyId: session.companyId } });
  } catch {
    return { error: "Couldn't delete — it may be in use by a request" };
  }
  revalidatePath(LEAVE);
  return { ok: true };
}

// ---- Leave requests -------------------------------------------------------
const RequestSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  leaveTypeId: z.string().min(1, "Leave type is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date is required"),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function createLeaveRequest(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const session = await requireCapability("leave:manage");
  const parsed = RequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // Tenant safety: employee + leave type must belong to this company.
  const [emp, type] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: d.employeeId, companyId: session.companyId, deletedAt: null },
      select: { id: true },
    }),
    prisma.leaveType.findFirst({
      where: { id: d.leaveTypeId, companyId: session.companyId },
      select: { id: true },
    }),
  ]);
  if (!emp) return { error: "Employee not found" };
  if (!type) return { error: "Leave type not found" };

  const start = dateAtUTC(d.startDate);
  const end = dateAtUTC(d.endDate);
  if (end < start) return { error: "End date can't be before the start date" };
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  await prisma.leaveRequest.create({
    data: {
      companyId: session.companyId,
      employeeId: d.employeeId,
      leaveTypeId: d.leaveTypeId,
      startDate: start,
      endDate: end,
      days,
      reason: d.reason || null,
      status: "PENDING",
    },
  });
  revalidatePath(LEAVE);
  return { ok: true };
}

/** Advances Employee → Manager → HR. Each call moves one step forward. */
export async function approveLeave(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId },
    select: { status: true },
  });
  if (!req) return { error: "Request not found" };

  if (req.status === "PENDING") {
    await prisma.leaveRequest.update({
      where: { id },
      data: { status: "MANAGER_APPROVED", managerApprovedById: session.userId },
    });
  } else if (req.status === "MANAGER_APPROVED") {
    await prisma.leaveRequest.update({
      where: { id },
      data: { status: "HR_APPROVED", hrApprovedById: session.userId, decidedAt: new Date() },
    });
  } else {
    return { error: "This request has already been decided" };
  }
  revalidatePath(LEAVE);
  return { ok: true };
}

export async function rejectLeave(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  await prisma.leaveRequest.updateMany({
    where: {
      id,
      companyId: session.companyId,
      status: { in: ["PENDING", "MANAGER_APPROVED"] },
    },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  revalidatePath(LEAVE);
  return { ok: true };
}
