"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LeavePaidType, AllowancePeriod, RequestKind, Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { computeBalances, remainingForType } from "@/lib/leave/balance";
import { countLeaveDays } from "@/lib/leave/count";
import { parseHalfDayPeriod } from "@/lib/leave/half-day";
import { parseWorkWeek } from "@/lib/leave/work-week";
import { deleteUpload } from "@/lib/uploads";
import { dateAtUTC, nowInZone, APP_TIME_ZONE } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notifications/notify";
import { broadcastLeaveApproved } from "@/lib/leave/notices";

export type LeaveState = { error?: string; ok?: boolean };
const LEAVE = "/leave";

// ---- Notifications --------------------------------------------------------
async function notifyUsers(
  userIds: string[],
  title: string,
  body: string,
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  const targets = [...new Set(userIds)].filter(Boolean);
  if (!targets.length) return;
  // Central fan-out: in-app bell + Web Push + (pref-gated) email.
  await notify(targets, { type: "LEAVE", title, body, meta });
}

/** Deep-link meta so clicking the notification opens the request's detail popup:
 *  "manage" → the all-requests page (approvers), "self" → the applicant's list. */
const reqMeta = (id: string, list: "manage" | "self"): Prisma.InputJsonValue => ({ leaveRequestId: id, list });

/** WFH vs leave wording for notifications — "WFH"/"Leave" for titles (start of
 *  sentence) and "WFH"/"leave" for mid-sentence bodies. */
const kindTitle = (kind: RequestKind): string => (kind === "WFH" ? "WFH" : "Leave");
const kindLower = (kind: RequestKind): string => (kind === "WFH" ? "WFH" : "leave");

// ---- Backdated-notification pause (TEMPORARY) -----------------------------
// While true, ADDING or APPROVING a leave/WFH whose start date is already in
// the past sends NO notifications — no notice to the employee, and no
// company-wide "who's away" broadcast. Flip to false to resume notifications
// for backdated requests. Normal (today/future) requests always notify.
const PAUSE_BACKDATED_LEAVE_NOTIFICATIONS = true;

/** Backdated = start date is before today in the app timezone (matches the
 *  "Backdate" badge shown in the request lists). */
function isBackdatedStart(start: Date): boolean {
  return start.toISOString().slice(0, 10) < nowInZone(APP_TIME_ZONE).dateISO;
}

/** Should this request's notifications be muted by the temporary backdated pause? */
function backdatedNotifyPaused(start: Date): boolean {
  return PAUSE_BACKDATED_LEAVE_NOTIFICATIONS && isBackdatedStart(start);
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
        attachmentEnabled: formData.get("attachmentEnabled") === "on",
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
        attachmentEnabled: formData.get("attachmentEnabled") === "on",
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
  halfDayPeriod: z.string().optional(),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

/** True if the employee already has a non-rejected request that overlaps in time
 *  with [start, end]. Two half-days on **opposite** halves of the same single day
 *  do NOT conflict (e.g. WFH first-half + leave second-half). Any full-day
 *  involvement, or two half-days on the same half, is a conflict. */
async function hasOverlappingLeave(
  companyId: string,
  employeeId: string,
  start: Date,
  end: Date,
  isHalfDay: boolean,
  halfDayPeriod: string | null,
): Promise<boolean> {
  const candidates = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      employeeId,
      status: { not: "REJECTED" },
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { startDate: true, endDate: true, isHalfDay: true, halfDayPeriod: true },
  });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const nStart = iso(start);
  const nSingle = nStart === iso(end);
  const nPeriod = halfDayPeriod ?? "FIRST";
  for (const e of candidates) {
    const eStart = iso(e.startDate);
    const eSingle = eStart === iso(e.endDate);
    // The only way two overlapping requests coexist: both are half-days on the
    // same single day, on opposite halves.
    const oppositeHalvesSameDay =
      nSingle &&
      eSingle &&
      nStart === eStart &&
      isHalfDay &&
      e.isHalfDay &&
      nPeriod !== (e.halfDayPeriod ?? "FIRST");
    if (!oppositeHalvesSameDay) return true; // a genuine time overlap
  }
  return false;
}

export async function applyLeave(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState & { id?: string }> {
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
  const halfDayPeriod = isHalfDay ? parseHalfDayPeriod(d.halfDayPeriod) : null;

  if (await hasOverlappingLeave(session.companyId, session.employeeId, start, end, isHalfDay, halfDayPeriod)) {
    return { error: "You already have a leave/WFH request covering these dates." };
  }

  // Only working days count — weekly offs, nth-Saturday rules, and holidays in
  // the span are excluded automatically.
  const days = await countLeaveDays(session.companyId, start, end, isHalfDay);
  if (days <= 0) {
    return { error: "Those dates are all non-working days (weekly offs or holidays)." };
  }

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

  const created = await prisma.leaveRequest.create({
    data: {
      companyId: session.companyId,
      employeeId: session.employeeId,
      kind: d.kind,
      leaveTypeId,
      startDate: start,
      endDate: end,
      days,
      isHalfDay,
      halfDayPeriod,
      reason: d.reason || null,
      status: "PENDING",
    },
    select: { id: true },
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
      `New ${kindLower(d.kind)} request`,
      `${emp?.fullName ?? "An employee"} requested ${kindLabel} for ${formatDate(start)} – ${formatDate(end)}.`,
      reqMeta(created.id, "manage"),
    );
  } catch (e) {
    console.error("[leave] notify approvers failed:", e);
  }

  revalidatePath("/leave");
  return { ok: true, id: created.id };
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
  kind: z.nativeEnum(RequestKind).optional(), // defaults to LEAVE; "WFH" for work-from-home
  leaveTypeId: z.string().optional().or(z.literal("")), // required only for LEAVE
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date is required"),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
  isHalfDay: z.enum(["true", "false"]).optional(),
  halfDayPeriod: z.string().optional(),
});

export async function createLeaveRequest(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState & { id?: string }> {
  const session = await requireCapability("leave:manage");
  const parsed = RequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const kind = d.kind ?? "LEAVE";

  // Tenant safety: the employee must belong to this company.
  const emp = await prisma.employee.findFirst({
    where: { id: d.employeeId, companyId: session.companyId, deletedAt: null },
    select: { id: true, fullName: true, user: { select: { id: true } } },
  });
  if (!emp) return { error: "Employee not found" };

  // A leave needs a valid type; WFH never has one.
  let leaveTypeId: string | null = null;
  if (kind === "LEAVE") {
    if (!d.leaveTypeId) return { error: "Select a leave type." };
    const type = await prisma.leaveType.findFirst({
      where: { id: d.leaveTypeId, companyId: session.companyId },
      select: { id: true },
    });
    if (!type) return { error: "Leave type not found" };
    leaveTypeId = type.id;
  }

  const start = dateAtUTC(d.startDate);
  const end = dateAtUTC(d.endDate);
  if (end < start) return { error: "End date can't be before the start date" };
  const half = d.isHalfDay === "true";
  if (half && d.startDate !== d.endDate) return { error: "Half-day requests must be on a single day." };
  const days = await countLeaveDays(session.companyId, start, end, half);
  if (days <= 0) {
    return { error: "Those dates are all non-working days (weekly offs or holidays)." };
  }

  // Balance guard mirrors self-service apply — leave only (WFH is uncapped).
  if (leaveTypeId) {
    const remaining = await remainingForType(session.companyId, d.employeeId, leaveTypeId);
    if (remaining !== null && days > remaining) {
      return { error: `Only ${remaining} day(s) left for this leave type.` };
    }
  }
  const halfPeriod = half ? parseHalfDayPeriod(d.halfDayPeriod) : null;
  if (await hasOverlappingLeave(session.companyId, d.employeeId, start, end, half, halfPeriod)) {
    return { error: "This employee already has a request covering these dates." };
  }

  // An approver raising a request for someone else is implicitly approving it,
  // so it lands approved (no Approve/Reject step). It stays PENDING when:
  //  - it's for THEMSELVES (segregation of duties — another approver decides), or
  //  - the creator only has add-for-others rights (leave:manage) but can't
  //    actually approve (leave:approve) — then it goes through normal approval.
  const isSelf = emp.user?.id === session.userId;
  const canApprove = await hasPermission(session.companyId, session.role, "leave:approve");
  const autoApprove = canApprove && !isSelf;

  const created = await prisma.leaveRequest.create({
    data: {
      companyId: session.companyId,
      employeeId: d.employeeId,
      kind,
      leaveTypeId,
      startDate: start,
      endDate: end,
      days,
      isHalfDay: half,
      halfDayPeriod: halfPeriod,
      reason: d.reason || null,
      status: autoApprove ? "HR_APPROVED" : "PENDING",
      hrApprovedById: autoApprove ? session.userId : null,
      decidedAt: autoApprove ? new Date() : null,
    },
    select: { id: true },
  });

  // Same downstream effects as a normal approval: notify the employee and give
  // everyone the company-wide "who's away" heads-up. Muted for backdated
  // requests while the temporary pause is on (PAUSE_BACKDATED_LEAVE_NOTIFICATIONS).
  if (autoApprove && !backdatedNotifyPaused(start)) {
    try {
      const empUserId = emp.user?.id;
      if (empUserId) {
        await notifyUsers(
          [empUserId],
          `${kindTitle(kind)} approved`,
          `A ${kindLower(kind)} request (${formatDate(start)} – ${formatDate(end)}) was added and approved for you.`,
          reqMeta(created.id, "self"),
        );
      }
      await broadcastLeaveApproved({
        companyId: session.companyId,
        applicantUserId: emp.user?.id ?? null,
        name: emp.fullName,
        kind,
        startISO: start.toISOString().slice(0, 10),
        endISO: end.toISOString().slice(0, 10),
      });
    } catch (e) {
      console.error("[leave] admin-created auto-approve notify failed:", e);
    }
  }

  revalidatePath(LEAVE);
  revalidatePath("/leave/requests");
  return { ok: true, id: created.id };
}

/**
 * Single-step approval: anyone with `leave:approve` (other than the applicant)
 * finalizes the request in one click. The approver + decision time are recorded
 * on `hrApprovedById` / `decidedAt` for the audit trail shown in the details.
 */
export async function approveLeave(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId },
    select: {
      status: true,
      kind: true,
      startDate: true,
      endDate: true,
      employee: { select: { fullName: true, user: { select: { id: true } } } },
    },
  });
  if (!req) return { error: "Request not found" };
  if (req.status === "HR_APPROVED" || req.status === "APPROVED" || req.status === "REJECTED") {
    return { error: "This request has already been decided" };
  }
  // Segregation of duties: you can't approve your own leave request.
  if (req.employee.user?.id === session.userId) {
    return { error: "You can't approve your own leave request." };
  }

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "HR_APPROVED", hrApprovedById: session.userId, decidedAt: new Date() },
  });

  // TEMPORARY pause: a backdated approval fires no notifications at all (see
  // PAUSE_BACKDATED_LEAVE_NOTIFICATIONS). Today/future approvals notify as usual.
  if (!backdatedNotifyPaused(req.startDate)) {
    // Notify the employee.
    try {
      const empUserId = req.employee.user?.id;
      if (empUserId) {
        await notifyUsers(
          [empUserId],
          `${kindTitle(req.kind)} approved`,
          `Your ${kindLower(req.kind)} request (${formatDate(req.startDate)} – ${formatDate(req.endDate)}) was approved.`,
          reqMeta(id, "self"),
        );
      }
    } catch (e) {
      console.error("[leave] notify employee (approve) failed:", e);
    }

    // Company-wide heads-up: everyone (bar the applicant) learns they'll be away.
    try {
      await broadcastLeaveApproved({
        companyId: session.companyId,
        applicantUserId: req.employee.user?.id ?? null,
        name: req.employee.fullName,
        kind: req.kind,
        startISO: req.startDate.toISOString().slice(0, 10),
        endISO: req.endDate.toISOString().slice(0, 10),
      });
    } catch (e) {
      console.error("[leave] broadcast approved failed:", e);
    }
  }

  revalidatePath(LEAVE);
  return { ok: true };
}

export async function rejectLeave(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId, status: { in: ["PENDING", "MANAGER_APPROVED"] } },
    select: {
      kind: true,
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
        `${kindTitle(req.kind)} rejected`,
        `Your ${kindLower(req.kind)} request (${formatDate(req.startDate)} – ${formatDate(req.endDate)}) was rejected.`,
        reqMeta(id, "self"),
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
  halfDayPeriod: string | null;
  days: number;
  reason: string | null;
  attachmentChanged?: boolean;
};

const EditSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date is required"),
  leaveTypeId: z.string().optional().or(z.literal("")),
  isHalfDay: z.string().optional(),
  halfDayPeriod: z.string().optional(),
  attachmentChanged: z.string().optional(),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function requestLeaveEdit(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing request id" };

  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId },
    select: { id: true, kind: true, employeeId: true, status: true },
  });
  if (!req) return { error: "Request not found" };

  // Only the person who applied may request an edit; managers approve/reject it.
  const isOwner = !!session.employeeId && session.employeeId === req.employeeId;
  if (!isOwner) return { error: "Only the person who applied can request an edit." };
  // Once decided (approved or rejected), the applicant can no longer change it —
  // only an authorized approver can edit or delete it after that.
  if (req.status !== "PENDING") {
    return { error: "This request has already been decided and can no longer be edited." };
  }

  const parsed = EditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const start = dateAtUTC(d.startDate);
  const end = dateAtUTC(d.endDate);
  if (end < start) return { error: "End date can't be before the start date" };
  if (req.kind === "LEAVE" && !d.leaveTypeId) return { error: "Select a leave type." };

  const singleDay = d.startDate === d.endDate;
  const isHalfDay = singleDay && d.isHalfDay === "on";
  const days = await countLeaveDays(session.companyId, start, end, isHalfDay);
  if (days <= 0) return { error: "Those dates are all non-working days (weekly offs or holidays)." };

  const pendingEdit: PendingEdit = {
    startDate: d.startDate,
    endDate: d.endDate,
    leaveTypeId: req.kind === "LEAVE" ? d.leaveTypeId || null : null,
    isHalfDay,
    halfDayPeriod: isHalfDay ? parseHalfDayPeriod(d.halfDayPeriod) : null,
    days,
    reason: d.reason || null,
    attachmentChanged: d.attachmentChanged === "true",
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
      `${kindTitle(req.kind)} edit requested`,
      `${emp?.fullName ?? "An employee"} requested a change to a ${kindLower(req.kind)} request (proposed ${formatDate(start)} – ${formatDate(end)}).`,
      reqMeta(id, "manage"),
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
    select: { pendingEdit: true, kind: true, employee: { select: { user: { select: { id: true } } } } },
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
      halfDayPeriod: p.isHalfDay ? p.halfDayPeriod ?? "FIRST" : null,
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
        `${kindTitle(req.kind)} change approved`,
        `Your requested change was approved (${formatDate(dateAtUTC(p.startDate))} – ${formatDate(dateAtUTC(p.endDate))}).`,
        reqMeta(id, "self"),
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
    select: { pendingEdit: true, kind: true, employee: { select: { user: { select: { id: true } } } } },
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
      await notifyUsers([empUserId], `${kindTitle(req.kind)} change rejected`, `Your requested change to a ${kindLower(req.kind)} request was rejected.`, reqMeta(id, "self"));
    }
  } catch (e) {
    console.error("[leave] notify edit reject failed:", e);
  }

  revalidatePath(LEAVE);
  return { ok: true };
}

// ---- Direct edit by an approver / Super Admin ------------------------------
const AdminEditSchema = EditSchema.extend({
  status: z.enum(["PENDING", "HR_APPROVED", "REJECTED"]),
});

/**
 * Direct edit of any leave/WFH request by someone with approve access (or a
 * Super Admin) — changes the dates, type, half-day, reason AND status in one
 * step and applies immediately (unlike the applicant's request-edit, which
 * needs approval). Segregation of duties still holds: you can't approve your
 * own leave by editing it.
 */
export async function adminEditLeave(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing request id" };

  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId },
    select: { kind: true, employee: { select: { user: { select: { id: true } } } } },
  });
  if (!req) return { error: "Request not found" };

  const parsed = AdminEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const start = dateAtUTC(d.startDate);
  const end = dateAtUTC(d.endDate);
  if (end < start) return { error: "End date can't be before the start date" };
  if (req.kind === "LEAVE" && !d.leaveTypeId) return { error: "Select a leave type." };

  // Segregation of duties: you can't approve your own leave by editing it.
  if (req.employee.user?.id === session.userId && d.status === "HR_APPROVED") {
    return { error: "You can't approve your own leave request." };
  }

  const singleDay = d.startDate === d.endDate;
  const isHalfDay = singleDay && d.isHalfDay === "on";
  const days = await countLeaveDays(session.companyId, start, end, isHalfDay);
  if (days <= 0) return { error: "Those dates are all non-working days (weekly offs or holidays)." };
  const decided = d.status === "HR_APPROVED" || d.status === "REJECTED";

  await prisma.leaveRequest.update({
    where: { id },
    data: {
      startDate: start,
      endDate: end,
      leaveTypeId: req.kind === "LEAVE" ? d.leaveTypeId || null : null,
      isHalfDay,
      halfDayPeriod: isHalfDay ? parseHalfDayPeriod(d.halfDayPeriod) : null,
      days,
      reason: d.reason || null,
      status: d.status,
      hrApprovedById: d.status === "HR_APPROVED" ? session.userId : null,
      decidedAt: decided ? new Date() : null,
      // An admin override supersedes any pending applicant edit-request.
      pendingEdit: Prisma.DbNull,
      editRequestedAt: null,
    },
  });

  try {
    const empUserId = req.employee.user?.id;
    if (empUserId && empUserId !== session.userId) {
      await notifyUsers(
        [empUserId],
        `${kindTitle(req.kind)} request updated`,
        `Your ${kindLower(req.kind)} request (${formatDate(start)} – ${formatDate(end)}) was updated by an administrator.`,
        reqMeta(id, "self"),
      );
    }
  } catch (e) {
    console.error("[leave] notify admin edit failed:", e);
  }

  revalidatePath(LEAVE);
  revalidatePath("/leave/requests");
  return { ok: true };
}

/**
 * Permanently delete a leave/WFH request. Restricted to people who can approve
 * leave (approvers / Super Admin) — the applicant can never delete their own.
 * Any attachments (rows + files on disk) are removed too.
 */
export async function deleteLeaveRequest(id: string): Promise<LeaveState> {
  const session = await requireCapability("leave:approve");
  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId: session.companyId },
    select: { id: true, attachments: { select: { id: true, fileKey: true } } },
  });
  if (!req) return { error: "Request not found" };

  // No cascade on the FK — delete attachment rows first, then their files.
  if (req.attachments.length) {
    await prisma.attachment.deleteMany({ where: { leaveRequestId: id } });
    for (const a of req.attachments) {
      if (a.fileKey) await deleteUpload(a.fileKey).catch(() => {});
    }
  }
  await prisma.leaveRequest.delete({ where: { id } });

  revalidatePath(LEAVE);
  revalidatePath("/leave/requests");
  return { ok: true };
}

// ---- Leave record (per-category usage) ------------------------------------
export type LeaveRecordRow = {
  name: string;
  used: number;
  allowance: number;
  unlimited: boolean;
  remaining: number;
};

/**
 * Per-category leave usage (taken / remaining) for the employee behind a
 * request — powers the "leave record" toggle in the detail popup. Visible to
 * leave managers and to the request's own owner.
 */
export async function getLeaveRecord(
  requestId: string,
): Promise<{ rows: LeaveRecordRow[] } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const req = await prisma.leaveRequest.findFirst({
    where: { id: requestId, companyId: session.companyId },
    select: { employeeId: true, employee: { select: { user: { select: { id: true } } } } },
  });
  if (!req) return { error: "Request not found" };
  const isOwner = !!req.employee.user?.id && req.employee.user.id === session.userId;
  if (!isOwner && !(await hasPermission(session.companyId, session.role, "leave:manage"))) {
    return { error: "Not authorized" };
  }
  const balances = await computeBalances(session.companyId, req.employeeId);
  return {
    rows: balances.map((b) => ({
      name: b.name,
      used: b.used,
      allowance: b.allowance,
      unlimited: b.unlimited,
      remaining: b.remaining,
    })),
  };
}

// ---- Working-days configuration (company-level) ---------------------------
const WorkWeekSchema = z.object({
  workingWeekdays: z.array(z.number().int().min(0).max(6)),
  saturdayOffWeeks: z.array(z.number().int().min(1).max(5)),
});

/**
 * Save the company's working-days config used for leave-day counting (which
 * weekdays are working, plus which nth-Saturdays are off). Org-level setting,
 * gated by `org:manage` (Super Admin / configured roles).
 */
export async function setWorkWeek(input: {
  workingWeekdays: number[];
  saturdayOffWeeks: number[];
}): Promise<LeaveState> {
  const session = await requireCapability("org:manage");
  const parsed = WorkWeekSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid working-days configuration." };
  const clean = parseWorkWeek(parsed.data); // normalize (dedupe, sort, bound)
  await prisma.company.update({
    where: { id: session.companyId },
    data: { workWeek: clean },
  });
  revalidatePath("/organization");
  revalidatePath("/leave");
  return { ok: true };
}
