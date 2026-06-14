"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";

export type ActionState = { error?: string; ok?: boolean };

const ORG = "/organization";

// ---- Departments ----------------------------------------------------------
const NameSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(80) });

export async function createDepartment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = NameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  try {
    await prisma.department.create({
      data: { companyId: session.companyId, name: parsed.data.name },
    });
  } catch {
    return { error: "A department with that name already exists" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

const DesignationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  departmentId: z.string().trim().min(1, "Department is required"),
});

export async function createDesignation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = DesignationSchema.safeParse({
    name: formData.get("name"),
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Ensure the department belongs to this company (tenant safety).
  const dept = await prisma.department.findFirst({
    where: { id: parsed.data.departmentId, companyId: session.companyId },
    select: { id: true },
  });
  if (!dept) return { error: "Invalid department" };

  try {
    await prisma.designation.create({
      data: {
        companyId: session.companyId,
        departmentId: parsed.data.departmentId,
        name: parsed.data.name,
      },
    });
  } catch {
    return { error: "That designation already exists in this department" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

// ---- Services -------------------------------------------------------------
const ServiceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  departmentId: z.string().trim().optional().nullable(),
});

export async function createService(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const raw = {
    name: formData.get("name"),
    departmentId: (formData.get("departmentId") as string) || null,
  };
  const parsed = ServiceSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Ensure the chosen department belongs to this company (tenant safety).
  if (parsed.data.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: parsed.data.departmentId, companyId: session.companyId },
      select: { id: true },
    });
    if (!dept) return { error: "Invalid department" };
  }

  try {
    await prisma.service.create({
      data: {
        companyId: session.companyId,
        name: parsed.data.name,
        departmentId: parsed.data.departmentId || null,
      },
    });
  } catch {
    return { error: "A service with that name already exists" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

// ---- Work shifts ----------------------------------------------------------
const ShiftSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  graceMinutes: z.coerce.number().int().min(0).max(180),
});

export async function createShift(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = ShiftSchema.safeParse({
    name: formData.get("name"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    graceMinutes: formData.get("graceMinutes") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await prisma.workShift.create({
    data: { companyId: session.companyId, ...parsed.data },
  });
  revalidatePath(ORG);
  return { ok: true };
}

// ---- Locations ------------------------------------------------------------
export async function createLocation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = NameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  try {
    await prisma.location.create({
      data: { companyId: session.companyId, name: parsed.data.name },
    });
  } catch {
    return { error: "A location with that name already exists" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

export async function setMultiLocation(value: boolean): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  await prisma.company.update({
    where: { id: session.companyId },
    data: { multiLocation: value },
  });
  revalidatePath(ORG);
  return { ok: true };
}

// ---- Probation periods ----------------------------------------------------
const MonthsSchema = z.object({
  months: z.coerce.number().int().min(1, "Enter a number of months").max(36),
});

export async function createProbationPeriod(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = MonthsSchema.safeParse({ months: formData.get("months") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  try {
    await prisma.probationPeriod.create({
      data: { companyId: session.companyId, months: parsed.data.months },
    });
  } catch {
    return { error: "That probation period already exists" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

// ---- Delete (shared) ------------------------------------------------------
type OrgEntity =
  | "department"
  | "service"
  | "designation"
  | "shift"
  | "location"
  | "probationPeriod";

export async function deleteOrgEntity(entity: OrgEntity, id: string): Promise<ActionState> {
  const session = await requireCapability("org:manage");

  // Every delete is scoped by companyId so one tenant can't touch another's rows.
  const scope = { id, companyId: session.companyId };
  try {
    if (entity === "department") await prisma.department.deleteMany({ where: scope });
    else if (entity === "service") await prisma.service.deleteMany({ where: scope });
    else if (entity === "designation") await prisma.designation.deleteMany({ where: scope });
    else if (entity === "shift") await prisma.workShift.deleteMany({ where: scope });
    else if (entity === "location") await prisma.location.deleteMany({ where: scope });
    else if (entity === "probationPeriod") await prisma.probationPeriod.deleteMany({ where: scope });
  } catch {
    return { error: "Couldn't delete — it may be in use by an employee" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

// ---- Service checklist templates ------------------------------------------
export async function addServiceChecklistItem(
  serviceId: string,
  text: string,
): Promise<{ ok?: boolean; error?: string; item?: { id: string; text: string } }> {
  const session = await requireCapability("org:manage");
  const t = text.trim();
  if (!t) return { error: "Item text is required" };
  const svc = await prisma.service.findFirst({
    where: { id: serviceId, companyId: session.companyId },
    select: { id: true },
  });
  if (!svc) return { error: "Service not found" };
  const count = await prisma.serviceChecklistItem.count({ where: { serviceId } });
  const item = await prisma.serviceChecklistItem.create({
    data: { serviceId, text: t, orderIndex: count },
    select: { id: true, text: true },
  });
  revalidatePath(ORG);
  return { ok: true, item };
}

export async function removeServiceChecklistItem(itemId: string): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  await prisma.serviceChecklistItem.deleteMany({
    where: { id: itemId, service: { companyId: session.companyId } },
  });
  revalidatePath(ORG);
  return { ok: true };
}

export async function renameServiceChecklistItem(
  itemId: string,
  text: string,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const t = text.trim();
  if (!t) return { error: "Item text is required" };
  await prisma.serviceChecklistItem.updateMany({
    where: { id: itemId, service: { companyId: session.companyId } },
    data: { text: t },
  });
  revalidatePath(ORG);
  return { ok: true };
}
