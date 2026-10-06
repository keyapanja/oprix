"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { dateAtUTC } from "@/lib/dates";
import { timingLengthMin, WEEKDAY_NAMES, type DayTiming } from "@/lib/attendance/timings";

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

/** Set (or clear, with null) the employee who heads a department. */
export async function setDepartmentHead(
  departmentId: string,
  employeeId: string | null,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const dept = await prisma.department.findFirst({
    where: { id: departmentId, companyId: session.companyId },
    select: { id: true },
  });
  if (!dept) return { error: "Department not found" };
  if (employeeId) {
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: session.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { error: "Invalid employee" };
  }
  await prisma.department.update({
    where: { id: departmentId },
    data: { headId: employeeId },
  });
  revalidatePath(ORG);
  return { ok: true };
}

/** Mark a department client-facing (its members are portal Business Managers) or not. */
export async function setDepartmentClientFacing(
  departmentId: string,
  clientFacing: boolean,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const res = await prisma.department.updateMany({
    where: { id: departmentId, companyId: session.companyId },
    data: { clientFacing },
  });
  if (res.count !== 1) return { error: "Department not found" };
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

// ---- Services (categories + sub-categories) -------------------------------
// A CATEGORY is top-level (parentId null) and carries a department. A
// SUB-CATEGORY lives under a category and inherits its department (stored on the
// row too, so department-scoped logic — TEAM visibility, KB — keeps working).
const ServiceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  departmentId: z.string().trim().optional().nullable(),
  parentId: z.string().trim().optional().nullable(),
});

export async function createService(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = ServiceSchema.safeParse({
    name: formData.get("name"),
    departmentId: (formData.get("departmentId") as string) || null,
    parentId: (formData.get("parentId") as string) || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { name, parentId } = parsed.data;

  let departmentId = parsed.data.departmentId || null;
  if (parentId) {
    // Sub-category: parent must be a top-level category in this company; inherit
    // its department.
    const parent = await prisma.service.findFirst({
      where: { id: parentId, companyId: session.companyId, parentId: null },
      select: { departmentId: true },
    });
    if (!parent) return { error: "Invalid category" };
    departmentId = parent.departmentId;
  } else if (departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, companyId: session.companyId },
      select: { id: true },
    });
    if (!dept) return { error: "Invalid department" };
  }

  try {
    await prisma.service.create({
      data: { companyId: session.companyId, name, departmentId, parentId },
    });
  } catch {
    return { error: "A service with that name already exists" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

/**
 * Bulk-create sub-categories under one category — pick the category once, add
 * many names. Each inherits the category's department; duplicates (service names
 * are unique per company) are skipped and counted.
 */
export async function addSubcategories(
  parentId: string,
  namesRaw: string[],
): Promise<ActionState & { created?: number; skipped?: number }> {
  const session = await requireCapability("org:manage");
  const parent = await prisma.service.findFirst({
    where: { id: parentId, companyId: session.companyId, parentId: null },
    select: { id: true, departmentId: true },
  });
  if (!parent) return { error: "Invalid category" };

  const names = [...new Set(namesRaw.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 80))].slice(0, 100);
  if (names.length === 0) return { error: "Enter at least one sub-category name" };

  const result = await prisma.service.createMany({
    data: names.map((name) => ({
      companyId: session.companyId,
      name,
      departmentId: parent.departmentId,
      parentId: parent.id,
    })),
    skipDuplicates: true,
  });
  revalidatePath(ORG);
  return { ok: true, created: result.count, skipped: names.length - result.count };
}

/**
 * Bulk-delete sub-categories. Each is removed in a transaction (its checklist
 * template first, then the row); any still referenced by a task / KB article /
 * employee are skipped and counted (so the rest still go through).
 */
export async function deleteSubcategories(
  ids: string[],
): Promise<ActionState & { deleted?: number; skipped?: number }> {
  const session = await requireCapability("org:manage");
  const subs = await prisma.service.findMany({
    where: { id: { in: ids }, companyId: session.companyId, parentId: { not: null } },
    select: { id: true },
  });
  let deleted = 0;
  let skipped = 0;
  for (const s of subs) {
    try {
      await prisma.$transaction([
        prisma.serviceChecklistItem.deleteMany({ where: { serviceId: s.id } }),
        prisma.service.delete({ where: { id: s.id } }),
      ]);
      deleted++;
    } catch {
      skipped++; // still referenced by a task / KB article / employee
    }
  }
  revalidatePath(ORG);
  return { ok: true, deleted, skipped };
}

/** Rename a category or sub-category. Service names are unique per company. */
export async function renameService(id: string, name: string): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = NameSchema.safeParse({ name });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    const res = await prisma.service.updateMany({
      where: { id, companyId: session.companyId },
      data: { name: parsed.data.name },
    });
    if (res.count === 0) return { error: "Service not found" };
  } catch {
    return { error: "A service with that name already exists" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

// ---- Work shifts ----------------------------------------------------------
const HHMM = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const GraceZ = z.coerce.number().int().min(0, "Grace can't be negative").max(180, "Keep grace to 180 minutes or less");
const LunchZ = z.coerce.number().int().min(0, "Lunch can't be negative").max(240, "Keep lunch to 240 minutes or less");

const ShiftSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  startTime: HHMM,
  endTime: HHMM,
  graceMinutes: GraceZ,
  lunchMinutes: LunchZ,
});

/** Lunch has to leave some of the day standing, or there are no hours to measure. */
function lunchError(t: DayTiming, what: string): string | null {
  const length = timingLengthMin(t);
  if (length === null) return `${what}: the start and end can't be the same time`;
  if (t.lunchMinutes >= length) return `${what}: lunch can't take up the whole day`;
  return null;
}

const WeekdayTimingsZ = z.record(
  z.string().regex(/^[0-6]$/),
  z.object({ start: HHMM, end: HHMM, graceMinutes: GraceZ, lunchMinutes: LunchZ }),
);

/**
 * The shift form's weekday hours, posted as JSON — { "6": { start, end, … } }.
 * Empty means none, which clears the column rather than storing "{}".
 */
function parseWeekdayInput(
  raw: FormDataEntryValue | null,
): { value: Prisma.InputJsonValue | typeof Prisma.DbNull } | { error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { value: Prisma.DbNull };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "Couldn't read the weekday hours — try again" };
  }
  const parsed = WeekdayTimingsZ.safeParse(json);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the weekday hours" };
  for (const [day, t] of Object.entries(parsed.data)) {
    const err = lunchError(t, WEEKDAY_NAMES[Number(day)]);
    if (err) return { error: err };
  }
  return { value: Object.keys(parsed.data).length ? parsed.data : Prisma.DbNull };
}

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
    lunchMinutes: formData.get("lunchMinutes") ?? 60,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const err = lunchError({ start: d.startTime, end: d.endTime, graceMinutes: d.graceMinutes, lunchMinutes: d.lunchMinutes }, "The shift");
  if (err) return { error: err };

  await prisma.workShift.create({
    data: { companyId: session.companyId, ...d },
  });
  revalidatePath(ORG);
  return { ok: true };
}

/**
 * The shift anyone without one of their own falls back to. Resolved when
 * attendance is read rather than written onto employees, so changing it moves
 * everyone relying on it at once and never overwrites a deliberate assignment.
 * Empty clears it, which puts those people back to having no shift at all.
 */
export async function setDefaultWorkShift(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const raw = String(formData.get("shiftId") ?? "").trim();

  if (raw) {
    const owned = await prisma.workShift.findFirst({
      where: { id: raw, companyId: session.companyId },
      select: { id: true },
    });
    if (!owned) return { error: "That shift doesn't exist" };
  }

  await prisma.company.update({
    where: { id: session.companyId },
    data: { defaultWorkShiftId: raw || null },
  });
  revalidatePath(ORG);
  revalidatePath("/attendance");
  return { ok: true };
}

const ShiftUpdateSchema = ShiftSchema.extend({ id: z.string().min(1, "Missing id") });

export async function updateShift(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = ShiftUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    graceMinutes: formData.get("graceMinutes") || 0,
    lunchMinutes: formData.get("lunchMinutes") ?? 60,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...data } = parsed.data;
  const err = lunchError(
    { start: data.startTime, end: data.endTime, graceMinutes: data.graceMinutes, lunchMinutes: data.lunchMinutes },
    "The shift",
  );
  if (err) return { error: err };
  const weekdays = parseWeekdayInput(formData.get("weekdayTimings"));
  if ("error" in weekdays) return { error: weekdays.error };

  const res = await prisma.workShift.updateMany({
    where: { id, companyId: session.companyId },
    data: { ...data, weekdayTimings: weekdays.value },
  });
  if (res.count === 0) return { error: "Shift not found" };
  revalidatePath(ORG);
  revalidatePath("/attendance");
  return { ok: true };
}

// ---- Special days -----------------------------------------------------------
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SpecialDayZ = z.object({
  fromDate: z.string().regex(ISO_DATE, "Pick the date"),
  toDate: z.union([z.string().regex(ISO_DATE), z.literal("")]),
  startTime: HHMM,
  endTime: HHMM,
  graceMinutes: GraceZ,
  lunchMinutes: LunchZ,
  note: z.string().trim().max(120, "Keep the note to 120 characters"),
  workingDay: z.boolean(),
  shiftIds: z.array(z.string().min(1)).min(1, "Pick at least one shift"),
});

/**
 * A dated change to some shifts' hours. Attendance applies it whenever it's
 * read, so it corrects every report covering its dates — past ones included —
 * the moment it's saved.
 */
export async function createSpecialDay(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = SpecialDayZ.safeParse({
    fromDate: formData.get("fromDate") ?? "",
    toDate: formData.get("toDate") ?? "",
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    graceMinutes: formData.get("graceMinutes") || 0,
    lunchMinutes: formData.get("lunchMinutes") || 0,
    note: formData.get("note") ?? "",
    workingDay: formData.get("workingDay") === "on",
    shiftIds: formData.getAll("shiftIds").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const to = d.toDate || d.fromDate;
  if (to < d.fromDate) return { error: "The last date is before the first" };
  if ((dateAtUTC(to).getTime() - dateAtUTC(d.fromDate).getTime()) / 86_400_000 > 366) {
    return { error: "Keep a special day to a year or less" };
  }
  const err = lunchError(
    { start: d.startTime, end: d.endTime, graceMinutes: d.graceMinutes, lunchMinutes: d.lunchMinutes },
    "The special day",
  );
  if (err) return { error: err };

  // Only this company's shifts, whatever the form sent.
  const shifts = await prisma.workShift.findMany({
    where: { companyId: session.companyId, id: { in: d.shiftIds } },
    select: { id: true },
  });
  if (shifts.length === 0) return { error: "Pick at least one shift" };

  await prisma.specialDay.create({
    data: {
      companyId: session.companyId,
      fromDate: dateAtUTC(d.fromDate),
      toDate: dateAtUTC(to),
      startTime: d.startTime,
      endTime: d.endTime,
      graceMinutes: d.graceMinutes,
      lunchMinutes: d.lunchMinutes,
      workingDay: d.workingDay,
      note: d.note || null,
      shiftIds: shifts.map((s) => s.id),
    },
  });
  revalidatePath(ORG);
  revalidatePath("/attendance");
  return { ok: true };
}

export async function deleteSpecialDay(id: string): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const res = await prisma.specialDay.deleteMany({ where: { id, companyId: session.companyId } });
  if (res.count === 0) return { error: "That special day is already gone" };
  revalidatePath(ORG);
  revalidatePath("/attendance");
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

// ---- Company profile ------------------------------------------------------
const CompanyInfoSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(120),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  businessType: z.string().trim().max(80).optional().or(z.literal("")),
  website: z.string().trim().url("Enter a valid website URL").max(200).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
});

// logoUrl is managed by the upload route (POST/DELETE /api/org/logo), not here.
export type CompanyInfoInput = {
  name: string;
  tagline?: string;
  businessType?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
};

export async function updateCompanyInfo(input: CompanyInfoInput): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = CompanyInfoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.company.update({
    where: { id: session.companyId },
    data: {
      name: d.name,
      tagline: d.tagline || null,
      businessType: d.businessType || null,
      website: d.website || null,
      email: d.email || null,
      phone: d.phone || null,
      address: d.address || null,
    },
  });
  revalidatePath(ORG);
  revalidatePath("/", "layout"); // company name/tagline appear in the sidebar
  return { ok: true };
}

// ---- Client-portal badge --------------------------------------------------
const PortalBadgeSchema = z.object({
  text: z.string().trim().max(40).optional().or(z.literal("")),
  name: z.string().trim().max(40).optional().or(z.literal("")),
  url: z.string().trim().url("Enter a valid link (https://…)").max(300).optional().or(z.literal("")),
});

export type PortalBadgeInput = { text?: string; name?: string; url?: string };

/**
 * The "Made by …" chip in the corner of the client portal.
 *
 * An empty name switches the chip off, so there's no separate enabled flag to
 * fall out of sync with it — clearing the field is the off switch.
 */
export async function updatePortalBadge(input: PortalBadgeInput): Promise<ActionState> {
  const session = await requireCapability("org:manage");
  const parsed = PortalBadgeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.company.update({
    where: { id: session.companyId },
    data: {
      portalBadgeText: d.text || null,
      portalBadgeName: d.name || null,
      portalBadgeUrl: d.url || null,
    },
  });
  revalidatePath(ORG);
  revalidatePath("/portal", "layout"); // the chip lives in the portal shell
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
    else if (entity === "service") {
      // Don't silently orphan sub-categories — make the admin clear them first.
      const childCount = await prisma.service.count({
        where: { parentId: id, companyId: session.companyId },
      });
      if (childCount > 0) return { error: "Delete its sub-categories first" };
      await prisma.service.deleteMany({ where: scope });
    }
    else if (entity === "designation") await prisma.designation.deleteMany({ where: scope });
    else if (entity === "shift") {
      // Drop the company default first, or the FK blocks the delete and the
      // error claims an employee is using it.
      await prisma.company.updateMany({
        where: { id: session.companyId, defaultWorkShiftId: id },
        data: { defaultWorkShiftId: null },
      });
      await prisma.workShift.deleteMany({ where: scope });
    }
    else if (entity === "location") await prisma.location.deleteMany({ where: scope });
    else if (entity === "probationPeriod") await prisma.probationPeriod.deleteMany({ where: scope });
  } catch {
    return { error: "Couldn't delete — it may be in use by an employee" };
  }
  revalidatePath(ORG);
  return { ok: true };
}

/**
 * Bulk-delete org rows of one entity type. Each is attempted independently;
 * rows still referenced (FK) — or, for a category, still holding sub-categories
 * — are skipped and counted so the rest still go through.
 */
export async function deleteOrgEntities(
  entity: OrgEntity,
  ids: string[],
): Promise<ActionState & { deleted?: number; skipped?: number }> {
  const session = await requireCapability("org:manage");
  const companyId = session.companyId;
  let deleted = 0;
  let skipped = 0;
  for (const id of ids) {
    const scope = { id, companyId };
    try {
      if (entity === "department") await prisma.department.deleteMany({ where: scope });
      else if (entity === "service") {
        const childCount = await prisma.service.count({ where: { parentId: id, companyId } });
        if (childCount > 0) {
          skipped++;
          continue;
        }
        await prisma.service.deleteMany({ where: scope });
      } else if (entity === "designation") await prisma.designation.deleteMany({ where: scope });
      else if (entity === "shift") {
        await prisma.company.updateMany({
          where: { id: companyId, defaultWorkShiftId: id },
          data: { defaultWorkShiftId: null },
        });
        await prisma.workShift.deleteMany({ where: scope });
      }
      else if (entity === "location") await prisma.location.deleteMany({ where: scope });
      else if (entity === "probationPeriod") await prisma.probationPeriod.deleteMany({ where: scope });
      deleted++;
    } catch {
      skipped++; // still referenced by an employee, etc.
    }
  }
  revalidatePath(ORG);
  return { ok: true, deleted, skipped };
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
