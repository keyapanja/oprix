"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LeavePaidType, AllowancePeriod, RequestKind, Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { remainingForType } from "@/lib/leave/balance";
import { dateAtUTC } from "@/lib/dates";
import { formatDate } from "@/lib/format";

export type LeaveState = { error?: string; ok?: boolean };
const LEAVE = "/leave";

// ---- Notifications --------------------------------------------------------
async function notifyUsers(userIds: string[], title: string, body: string): Promise<void> {
  const targets = [...new Set(userIds)].filter(Boolean);
  if (!targets.length) return;
  await prisma.notification.createMany({
    data: targets.map((userId) => ({ userId, type: "LEAVE", title, body })),
  });
}

/** Active users whose role can approve leave (admins / HR / team leads / configured). */
async function leaveApproverUserIds(companyId: string, exclude?: string): Promise<string[]> {
  const roles: Role[] = [];
  for (const role of ["SUPER_ADMIN", "HR_MANAGER", "PROJECT_MANAGER", "TEAM_LEAD", "EMPLOYEE"] as Role[]) {
    if (await hasPermission(companyId, role, "leave:approve")) roles.push(role);
  }
  if (!roles.length) return [];
  const users = await prisma.user.findMany({
    where: { companyId, isActive: true, role: { in: roles } },
    select: { id: true },
  });
  return users.map((u) => u.id).filter((id) => id !== exclude);
}

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
  const unlimited = formData.get("unlimited") === "on";
  const parsed = LeaveTypeSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    paidType: formData.get("paidType"),
    allowanceValue: unlimited ? 0 : formData.get("allowanceValue"),
    allowancePeriod: unlimited ? "YEAR" : formData.get("allowancePeriod"),
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
        unlimited,
      },
    });
  } catch {
    return { error: "A leave type with that name already exists" };
  }
  revalidatePath(LEAVE);
  return { ok: true };
}

export async function updateLeaveType(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const session = await requireCapability("leave:manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing leave type id" };
  const unlimited = formData.get("unlimited") === "on";
  const parsed = LeaveTypeSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    paidType: formData.get("paidType"),
    allowanceValue: unlimited ? 0 : formData.get("allowanceValue"),
    allowancePeriod: unlimited ? "YEAR" : formData.get("allowancePeriod"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const res = await prisma.leaveType.updateMany({
      where: { id, companyId: session.companyId },
      data: {
        name: d.name,
        description: d.description || null,
        paidType: d.paidType,
        allowanceValue: d.allowanceValue,
        allowancePeriod: d.allowancePeriod,
        unlimited,
      },
    });
    if (res.count === 0) return { error: "Leave type not found" };
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

/** True if the employee already has a non-rejected request overlapping [start, end]. */
async function hasOverlappingLeave(companyId: string, employeeId: string, start: Date, end: Date): Promise<boolean> {
  const n = await prisma.leaveRequest.count({
    where: {
      companyId,
      employeeId,
      status: { not: "REJECTED" },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  return n > 0;
}

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

  if (await hasOverlappingLeave(session.companyId, session.employeeId, start, end)) {
    return { error: "You already have a leave/WFH request covering these dates." };
  }

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

  // Notify everyone who can approve leave.
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: session.employeeId },
      select: { fullName: true },
    });
    const kindLabel = d.kind === "WFH" ? "work from home" : "leave";
    const approvers = await leaveApproverUserIds(session.companyId, session.userId);
    await notifyUsers(
      approvers,
      "New leave request",
      `${emp?.fullName ?? "An employee"} requested ${kindLabel} for ${formatDate(start)} – ${formatDate(end)}.`,
    );
  } catch (e) {
    console.error("[leave] notify approvers failed:", e);
  }

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

  // Enforce the same balance + overlap guards as self-service apply.
  const remaining = await remainingForType(session.companyId, d.employeeId, d.leaveTypeId);
  if (remaining !== null && days > remaining) {
    return { error: `Only ${remaining} day(s) left for this leave type.` };
  }
  if (await hasOverlappingLeave(session.companyId, d.employeeId, start, end)) {
    return { error: "This employee already has a request covering these dates." };
  }

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
    select: {
      status: true,
      startDate: true,
      endDate: true,
      managerApprovedById: true,
      employee: { select: { user: { select: { id: true } } } },
    },
  });
  if (!req) return { error: "Request not found" };

  // Segregation of duties: you can't approve your own leave request.
  if (req.employee.user?.id === session.userId) {
    return { error: "You can't approve your own leave request." };
  }

  let newStatus: "MANAGER_APPROVED" | "HR_APPROVED";
  if (req.status === "PENDING") {
    newStatus = "MANAGER_APPROVED";
    await prisma.leaveRequest.update({
      where: { id },
      data: { status: newStatus, managerApprovedById: session.userId },
    });
  } else if (req.status === "MANAGER_APPROVED") {
    // The final (HR) approval must be a different person than the manager step.
    if (req.managerApprovedById === session.userId) {
      return { error: "The final approval must be done by someone other than the manager who approved it." };
    }
    newStatus = "HR_APPROVED";
    await prisma.leaveRequest.update({
      where: { id },
      data: { status: newStatus, hrApprovedById: session.userId, decidedAt: new Date() },
    });
  } else {
    return { error: "This request has already been decided" };
  }

  // Notify the employee.
  try {
    const empUserId = req.employee.user?.id;
    if (empUserId) {
      const range = `${formatDate(req.startDate)} – ${formatDate(req.endDate)}`;
      const final = newStatus === "HR_APPROVED";
      await notifyUsers(
        [empUserId],
        final ? "Leave approved" : "Leave approved by manager",
        final
          ? `Your leave request (${range}) was approved.`
          : `Your leave request (${range}) was approved by your manager — pending final approval.`,
      );
    }
  } catch (e) {
    console.error("[leave] notify employee (approve) failed:", e);
  }

  revalidatePath(LEAVE);
  return { ok: true };
}

export async function rejectLeave(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId, status: { in: ["PENDING", "MANAGER_APPROVED"] } },
    select: {
      startDate: true,
      endDate: true,
      employee: { select: { user: { select: { id: true } } } },
    },
  });
  if (!req) return { error: "This request has already been decided" };

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "REJECTED", decidedAt: new Date() },
  });

  // Notify the employee.
  try {
    const empUserId = req.employee.user?.id;
    if (empUserId) {
      await notifyUsers(
        [empUserId],
        "Leave rejected",
        `Your leave request (${formatDate(req.startDate)} – ${formatDate(req.endDate)}) was rejected.`,
      );
    }
  } catch (e) {
    console.error("[leave] notify employee (reject) failed:", e);
  }

  revalidatePath(LEAVE);
  return { ok: true };
}

// ---- Edit requests (applicant proposes; an approver applies) ---------------
// A requested edit is stored as `pendingEdit` and does NOT change the live
// request until an approver applies it. The applicant (and approvers) can see
// the pending change in the meantime.
export type PendingEdit = {
  startDate: string;
  endDate: string;
  leaveTypeId: string | null;
  isHalfDay: boolean;
  days: number;
  reason: string | null;
};

const EditSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date is required"),
  leaveTypeId: z.string().optional().or(z.literal("")),
  isHalfDay: z.string().optional(),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function requestLeaveEdit(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing request id" };

  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId },
    select: { id: true, kind: true, employeeId: true },
  });
  if (!req) return { error: "Request not found" };

  const canManage = await hasPermission(session.companyId, session.role, "leave:manage");
  const isOwner = !!session.employeeId && session.employeeId === req.employeeId;
  if (!isOwner && !canManage) return { error: "You can only request edits on your own leave." };

  const parsed = EditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const start = dateAtUTC(d.startDate);
  const end = dateAtUTC(d.endDate);
  if (end < start) return { error: "End date can't be before the start date" };
  if (req.kind === "LEAVE" && !d.leaveTypeId) return { error: "Select a leave type." };

  const singleDay = d.startDate === d.endDate;
  const isHalfDay = singleDay && d.isHalfDay === "on";
  const days = isHalfDay ? 0.5 : Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  const pendingEdit: PendingEdit = {
    startDate: d.startDate,
    endDate: d.endDate,
    leaveTypeId: req.kind === "LEAVE" ? d.leaveTypeId || null : null,
    isHalfDay,
    days,
    reason: d.reason || null,
  };

  await prisma.leaveRequest.update({
    where: { id },
    data: { pendingEdit, editRequestedAt: new Date() },
  });

  try {
    const emp = await prisma.employee.findUnique({ where: { id: req.employeeId }, select: { fullName: true } });
    const approvers = await leaveApproverUserIds(session.companyId, session.userId);
    await notifyUsers(
      approvers,
      "Leave edit requested",
      `${emp?.fullName ?? "An employee"} requested a change to a ${req.kind === "WFH" ? "WFH" : "leave"} request (proposed ${formatDate(start)} – ${formatDate(end)}).`,
    );
  } catch (e) {
    console.error("[leave] notify edit request failed:", e);
  }

  revalidatePath(LEAVE);
  return { ok: true };
}

export async function approveLeaveEdit(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId },
    select: { pendingEdit: true, employee: { select: { user: { select: { id: true } } } } },
  });
  if (!req) return { error: "Request not found" };
  if (!req.pendingEdit) return { error: "No pending edit to approve" };
  // Segregation of duties: can't approve a change to your own leave.
  if (req.employee.user?.id === session.userId) {
    return { error: "You can't approve a change to your own leave." };
  }

  const p = req.pendingEdit as unknown as PendingEdit;
  await prisma.leaveRequest.update({
    where: { id },
    data: {
      startDate: dateAtUTC(p.startDate),
      endDate: dateAtUTC(p.endDate),
      leaveTypeId: p.leaveTypeId,
      isHalfDay: p.isHalfDay,
      days: p.days,
      reason: p.reason,
      pendingEdit: Prisma.DbNull,
      editRequestedAt: null,
    },
  });

  try {
    const empUserId = req.employee.user?.id;
    if (empUserId) {
      await notifyUsers(
        [empUserId],
        "Leave change approved",
        `Your requested change was approved (${formatDate(dateAtUTC(p.startDate))} – ${formatDate(dateAtUTC(p.endDate))}).`,
      );
    }
  } catch (e) {
    console.error("[leave] notify edit approve failed:", e);
  }

  revalidatePath(LEAVE);
  return { ok: true };
}

export async function rejectLeaveEdit(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId },
    select: { pendingEdit: true, employee: { select: { user: { select: { id: true } } } } },
  });
  if (!req) return { error: "Request not found" };
  if (!req.pendingEdit) return { error: "No pending edit to reject" };

  await prisma.leaveRequest.update({
    where: { id },
    data: { pendingEdit: Prisma.DbNull, editRequestedAt: null },
  });

  try {
    const empUserId = req.employee.user?.id;
    if (empUserId) {
      await notifyUsers([empUserId], "Leave change rejected", "Your requested change to a leave request was rejected.");
    }
  } catch (e) {
    console.error("[leave] notify edit reject failed:", e);
  }

  revalidatePath(LEAVE);
  return { ok: true };
}
