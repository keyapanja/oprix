"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EmploymentType, ProbationStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { sendInviteEmail, appUrl } from "@/lib/email";
import { nextEmployeeCode } from "@/lib/employees/code";

export type EmployeeFormState = { error?: string; ok?: boolean };

const EmployeeSchema = z.object({
  // employeeCode is auto-generated server-side, never taken from the form.
  fullName: z.string().trim().min(1, "Full name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  joiningDate: z.string().min(1, "Joining date is required"),
  dateOfBirth: z.string().optional().or(z.literal("")),
  employmentType: z.nativeEnum(EmploymentType),
  probationStatus: z.nativeEnum(ProbationStatus),
  probationMonths: z.string().optional().or(z.literal("")),
  departmentId: z.string().optional().or(z.literal("")),
  teamId: z.string().optional().or(z.literal("")),
  designationId: z.string().optional().or(z.literal("")),
  managerId: z.string().optional().or(z.literal("")),
  workShiftId: z.string().optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal("")),
});

/** Confirm every provided foreign key belongs to this company (tenant safety). */
async function assertOwnedRefs(
  companyId: string,
  refs: Record<string, string | undefined | null>,
): Promise<boolean> {
  const checks: Promise<boolean>[] = [];
  if (refs.departmentId)
    checks.push(exists(prisma.department.findFirst({ where: { id: refs.departmentId, companyId }, select: { id: true } })));
  if (refs.teamId)
    checks.push(exists(prisma.team.findFirst({ where: { id: refs.teamId, companyId }, select: { id: true } })));
  if (refs.designationId)
    checks.push(exists(prisma.designation.findFirst({ where: { id: refs.designationId, companyId }, select: { id: true } })));
  if (refs.managerId)
    checks.push(exists(prisma.employee.findFirst({ where: { id: refs.managerId, companyId }, select: { id: true } })));
  if (refs.workShiftId)
    checks.push(exists(prisma.workShift.findFirst({ where: { id: refs.workShiftId, companyId }, select: { id: true } })));
  if (refs.locationId)
    checks.push(exists(prisma.location.findFirst({ where: { id: refs.locationId, companyId }, select: { id: true } })));
  const results = await Promise.all(checks);
  return results.every(Boolean);
}

async function exists(p: Promise<unknown>): Promise<boolean> {
  return (await p) != null;
}

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const session = await requireCapability("employee:manage");

  const parsed = EmployeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true, employeeCodePrefix: true, multiLocation: true },
  });
  if (!company) return { error: "Company not found" };

  const refsOk = await assertOwnedRefs(session.companyId, {
    departmentId: d.departmentId,
    teamId: d.teamId,
    designationId: d.designationId,
    managerId: d.managerId,
    workShiftId: d.workShiftId,
    locationId: d.locationId,
  });
  if (!refsOk) return { error: "One of the selected options is invalid" };

  // Resolve work location: multi-location -> form choice; single -> the one location.
  let locationId: string | null = null;
  if (company.multiLocation) {
    locationId = d.locationId || null;
  } else {
    const only = await prisma.location.findFirst({
      where: { companyId: session.companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    locationId = only?.id ?? null;
  }

  const probationMonths = d.probationMonths ? parseInt(d.probationMonths, 10) : null;
  const employeeCode = await nextEmployeeCode(session.companyId, company.employeeCodePrefix);

  let employee;
  try {
    employee = await prisma.employee.create({
      data: {
        companyId: session.companyId,
        employeeCode,
        fullName: d.fullName,
        email: d.email,
        phone: d.phone || null,
        joiningDate: new Date(d.joiningDate),
        dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
        employmentType: d.employmentType,
        probationStatus: d.probationStatus,
        probationMonths,
        departmentId: d.departmentId || null,
        teamId: d.teamId || null,
        designationId: d.designationId || null,
        managerId: d.managerId || null,
        workShiftId: d.workShiftId || null,
        locationId,
      },
    });
  } catch {
    return { error: "Couldn't create the employee — the code may already exist, try again" };
  }

  // Provision a login + send a "set your password" invite (best-effort).
  await inviteEmployeeUser({
    companyId: session.companyId,
    companyName: company.name,
    employeeId: employee.id,
    fullName: d.fullName,
    email: d.email,
  });

  revalidatePath("/employees");
  redirect("/employees");
}

/** Creates an EMPLOYEE-role login (no password yet) and emails a setup link. */
async function inviteEmployeeUser(opts: {
  companyId: string;
  companyName: string;
  employeeId: string;
  fullName: string;
  email: string;
}): Promise<void> {
  // Skip if a user with this email already exists in the company.
  const existing = await prisma.user.findFirst({
    where: { companyId: opts.companyId, email: opts.email },
    select: { id: true },
  });
  if (existing) return;

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await prisma.user.create({
      data: {
        companyId: opts.companyId,
        email: opts.email,
        role: Role.EMPLOYEE,
        employeeId: opts.employeeId,
        passwordHash: null,
        setupToken: token,
        setupTokenExpiresAt: expires,
      },
    });
    await sendInviteEmail({
      to: opts.email,
      name: opts.fullName,
      companyName: opts.companyName,
      link: appUrl(`/set-password?token=${token}`),
    });
  } catch (e) {
    // Never fail employee creation because of invite/email issues.
    console.error("[invite] failed:", e);
  }
}

/** Re-issues a fresh setup token and re-sends the invite email for an employee. */
export async function resendInvite(
  employeeId: string,
): Promise<{ error?: string; ok?: boolean; delivered?: boolean }> {
  const session = await requireCapability("employee:manage");

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: session.companyId, deletedAt: null },
    select: { id: true, fullName: true, email: true },
  });
  if (!employee) return { error: "Employee not found" };

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true },
  });

  // Find the linked login (by employee link or matching email).
  const user = await prisma.user.findFirst({
    where: {
      companyId: session.companyId,
      OR: [{ employeeId: employee.id }, { email: employee.email }],
    },
    select: { id: true, passwordHash: true },
  });

  if (user?.passwordHash) {
    return { error: "This employee has already set up their account." };
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { setupToken: token, setupTokenExpiresAt: expires },
    });
  } else {
    await prisma.user.create({
      data: {
        companyId: session.companyId,
        email: employee.email,
        role: Role.EMPLOYEE,
        employeeId: employee.id,
        passwordHash: null,
        setupToken: token,
        setupTokenExpiresAt: expires,
      },
    });
  }

  let delivered = false;
  try {
    const res = await sendInviteEmail({
      to: employee.email,
      name: employee.fullName,
      companyName: company?.name ?? "Operix",
      link: appUrl(`/set-password?token=${token}`),
    });
    delivered = res.delivered;
  } catch (e) {
    console.error("[resend-invite] email failed:", e);
  }

  revalidatePath(`/employees/${employee.id}`);
  return { ok: true, delivered };
}

export async function softDeleteEmployee(id: string): Promise<EmployeeFormState> {
  const session = await requireCapability("employee:manage");
  await prisma.employee.updateMany({
    where: { id, companyId: session.companyId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/employees");
  return {};
}

const ContactSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  relationship: z.string().trim().max(60).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Phone is required").max(30),
});

export async function addEmergencyContact(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const session = await requireCapability("employee:manage");
  const parsed = ContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  // Ensure the employee belongs to this company before attaching a contact.
  const emp = await prisma.employee.findFirst({
    where: { id: d.employeeId, companyId: session.companyId },
    select: { id: true },
  });
  if (!emp) return { error: "Employee not found" };

  await prisma.emergencyContact.create({
    data: {
      employeeId: d.employeeId,
      name: d.name,
      relationship: d.relationship || null,
      phone: d.phone,
    },
  });
  revalidatePath(`/employees/${d.employeeId}`);
  return { ok: true };
}
