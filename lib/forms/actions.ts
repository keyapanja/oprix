"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability, requirePortalAction } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { canManageForms, audienceAllows } from "@/lib/forms/access";
import { FormSchemaZ, validateAnswers, parseSchema, answerToText, isInputField } from "@/lib/forms/types";
import { ScheduleZ } from "@/lib/forms/schedule";
import { EDITABLE_ROLES } from "@/lib/auth/can";
import { logActivity, actorLabel } from "@/lib/activity";

export type FormActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  fieldErrors?: Record<string, string>;
};

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;
const VALID_ROLES = new Set<string>(EDITABLE_ROLES);

// ---- Build / manage (form:manage) -----------------------------------------

/** Create a blank draft form and return its id. */
export async function createForm(title: string): Promise<FormActionState> {
  const session = await requireCapability("form:manage");
  const t = title.trim();
  if (!t) return { error: "Give the form a title." };
  const form = await prisma.form.create({
    data: {
      companyId: session.companyId,
      title: t.slice(0, 200),
      schema: asJson({ fields: [] }),
      createdById: session.userId,
    },
    select: { id: true },
  });
  revalidatePath("/forms");
  return { ok: true, id: form.id };
}

const UpdateZ = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Give the form a title.").max(200),
  description: z.string().trim().max(2000).nullish(),
  schema: FormSchemaZ,
  audienceRoles: z.array(z.string()),
  viewAllRoles: z.array(z.string()),
  portalEnabled: z.boolean(),
  allowMultiple: z.boolean(),
  inMenu: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]),
  notifyEnabled: z.boolean().optional(),
  notifySchedule: ScheduleZ.nullish(),
});
export type UpdateFormInput = z.input<typeof UpdateZ>;

/** Save the whole form — structure, settings, and access. */
export async function updateForm(input: UpdateFormInput): Promise<FormActionState> {
  const session = await requireCapability("form:manage");
  const parsed = UpdateZ.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid form." };
  const d = parsed.data;

  const audience = d.audienceRoles.filter((r) => VALID_ROLES.has(r)) as Role[];
  // You can only see "all entries" for a role that can actually access the form.
  const viewAll = d.viewAllRoles.filter((r) => VALID_ROLES.has(r) && audience.includes(r as Role)) as Role[];

  const res = await prisma.form.updateMany({
    where: { id: d.id, companyId: session.companyId, deletedAt: null },
    data: {
      title: d.title,
      description: d.description || null,
      schema: asJson(d.schema),
      audienceRoles: audience,
      viewAllRoles: viewAll,
      portalEnabled: d.portalEnabled,
      allowMultiple: d.allowMultiple,
      inMenu: !!d.inMenu,
      status: d.status,
      notifyEnabled: !!d.notifyEnabled,
      notifySchedule: d.notifySchedule ? asJson(d.notifySchedule) : Prisma.DbNull,
    },
  });
  if (res.count === 0) return { error: "Form not found." };
  revalidatePath("/forms");
  revalidatePath(`/forms/${d.id}/edit`);
  return { ok: true, id: d.id };
}

/** Quick publish / close / re-draft toggle from the list or builder. */
export async function setFormStatus(
  id: string,
  status: "DRAFT" | "PUBLISHED" | "CLOSED",
): Promise<FormActionState> {
  const session = await requireCapability("form:manage");
  const res = await prisma.form.updateMany({
    where: { id, companyId: session.companyId, deletedAt: null },
    data: { status },
  });
  if (res.count === 0) return { error: "Form not found." };
  revalidatePath("/forms");
  return { ok: true };
}

/** Soft-delete a form (rides the Trash module). */
export async function deleteForm(id: string): Promise<FormActionState> {
  const session = await requireCapability("form:manage");
  const res = await prisma.form.updateMany({
    where: { id, companyId: session.companyId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: session.userId },
  });
  if (res.count === 0) return { error: "Form not found." };
  revalidatePath("/forms");
  return { ok: true };
}

// ---- Fill (any user with access) ------------------------------------------

/** Submit an entry. Validates answers against the live schema and enforces the
 *  single-submission rule when allowMultiple is off. */
export async function submitForm(
  formId: string,
  data: Record<string, unknown>,
): Promise<FormActionState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const form = await prisma.form.findFirst({
    where: { id: formId, companyId: session.companyId, deletedAt: null },
  });
  if (!form) return { error: "Form not found." };

  const manage = await canManageForms(session);
  if (!manage && !audienceAllows(form, session.role)) {
    return { error: "You don't have access to this form." };
  }
  if (form.status !== "PUBLISHED" && !manage) {
    return { error: "This form isn't open for submissions." };
  }

  const schema = parseSchema(form.schema);
  const { ok, errors, clean } = validateAnswers(schema.fields, data);
  if (!ok) return { error: "Please fix the highlighted fields.", fieldErrors: errors };

  if (!form.allowMultiple) {
    const existing = await prisma.formSubmission.findFirst({
      where: { formId, companyId: session.companyId, submittedByUserId: session.userId, deletedAt: null },
      select: { id: true },
    });
    if (existing) return { error: "You've already submitted this form." };
  }

  await prisma.formSubmission.create({
    data: {
      companyId: session.companyId,
      formId,
      data: asJson(clean),
      submittedByUserId: session.userId,
    },
  });
  revalidatePath(`/forms/${formId}/entries`);
  return { ok: true };
}

/** Submit a portal form as the signed-in client. */
export async function submitPortalForm(
  formId: string,
  data: Record<string, unknown>,
): Promise<FormActionState> {
  const session = await requirePortalAction();
  const form = await prisma.form.findFirst({
    where: { id: formId, companyId: session.companyId, deletedAt: null, status: "PUBLISHED", portalEnabled: true },
  });
  if (!form) return { error: "Form not found." };

  const schema = parseSchema(form.schema);
  const { ok, errors, clean } = validateAnswers(schema.fields, data);
  if (!ok) return { error: "Please fix the highlighted fields.", fieldErrors: errors };

  if (!form.allowMultiple) {
    const existing = await prisma.formSubmission.findFirst({
      where: { formId, companyId: session.companyId, submittedByClientId: session.clientId, deletedAt: null },
      select: { id: true },
    });
    if (existing) return { error: "You've already submitted this form." };
  }

  await prisma.formSubmission.create({
    data: {
      companyId: session.companyId,
      formId,
      data: asJson(clean),
      submittedByClientId: session.clientId,
    },
  });
  return { ok: true };
}

/** Edit an entry's answers — a form manager, or the person who submitted it.
 *  Re-validated against the live form schema; calc fields are recomputed. */
export async function updateSubmission(
  id: string,
  data: Record<string, unknown>,
): Promise<FormActionState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  const sub = await prisma.formSubmission.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: { id: true, formId: true, submittedByUserId: true, data: true, form: { select: { schema: true } } },
  });
  if (!sub) return { error: "Entry not found." };

  const manage = await canManageForms(session);
  if (!manage && sub.submittedByUserId !== session.userId) {
    return { error: "You can't edit this entry." };
  }

  const schema = parseSchema(sub.form.schema);
  const { ok, errors, clean } = validateAnswers(schema.fields, data);
  if (!ok) return { error: "Please fix the highlighted fields.", fieldErrors: errors };

  // Field-level diff (human-readable) so the history shows what actually changed.
  const before = (sub.data && typeof sub.data === "object" ? sub.data : {}) as Record<string, unknown>;
  const changes: SubmissionChange[] = [];
  for (const f of schema.fields) {
    if (!isInputField(f.type)) continue;
    const from = answerToText(f, before[f.id]);
    const to = answerToText(f, clean[f.id]);
    if (from !== to) changes.push({ label: f.label, from: from.slice(0, 200), to: to.slice(0, 200) });
  }

  await prisma.formSubmission.update({
    where: { id },
    // Only stamp an "edit" when something actually changed.
    data: { data: asJson(clean), ...(changes.length ? { editedAt: new Date(), editedById: session.userId } : {}) },
  });
  // Append-only audit trail: who edited the entry, when, and what changed.
  if (changes.length) {
    await logActivity({
      companyId: session.companyId,
      actorId: session.userId,
      actorLabel: await actorLabel(session.userId),
      entityType: "FORM_SUBMISSION",
      entityId: id,
      message: "Updated the entry",
      meta: { changes },
    });
  }
  revalidatePath(`/forms/${sub.formId}/entries`);
  return { ok: true };
}

export type SubmissionChange = { label: string; from: string; to: string };
export type SubmissionEvent = { actor: string; at: string; action: string; changes: SubmissionChange[] };

/** The edit history for one entry — who changed it and when. Visible to a form
 *  manager or the person who submitted it. */
export async function getSubmissionHistory(id: string): Promise<SubmissionEvent[]> {
  const session = await getSession();
  if (!session) return [];
  const sub = await prisma.formSubmission.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: { id: true, submittedByUserId: true },
  });
  if (!sub) return [];
  const manage = await canManageForms(session);
  if (!manage && sub.submittedByUserId !== session.userId) return [];

  const logs = await prisma.activityLog.findMany({
    where: { companyId: session.companyId, entityType: "FORM_SUBMISSION", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return logs.map((l) => {
    const m = (l.meta ?? {}) as { actor?: string; changes?: SubmissionChange[] };
    return {
      actor: m.actor ?? "Someone",
      at: l.createdAt.toISOString(),
      action: l.action,
      changes: Array.isArray(m.changes) ? m.changes : [],
    };
  });
}

/** Toggle a single-checkbox (`check`) field straight from the entries table.
 *  Surgical — touches only that field (no full re-validation), stamps the edit,
 *  and records the same before→after diff in the history. Manager or submitter. */
export async function toggleSubmissionCheck(
  id: string,
  fieldId: string,
  value: boolean,
): Promise<FormActionState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  const sub = await prisma.formSubmission.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: { id: true, formId: true, submittedByUserId: true, data: true, form: { select: { schema: true } } },
  });
  if (!sub) return { error: "Entry not found." };

  const manage = await canManageForms(session);
  if (!manage && sub.submittedByUserId !== session.userId) {
    return { error: "You can't edit this entry." };
  }

  const field = parseSchema(sub.form.schema).fields.find((f) => f.id === fieldId);
  if (!field || field.type !== "check") return { error: "Field not found." };

  const data = (sub.data && typeof sub.data === "object" ? { ...(sub.data as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const from = answerToText(field, data[fieldId]);
  data[fieldId] = value === true;
  const to = answerToText(field, data[fieldId]);
  if (from === to) return { ok: true }; // already in that state — no-op

  await prisma.formSubmission.update({
    where: { id },
    data: { data: asJson(data), editedAt: new Date(), editedById: session.userId },
  });
  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: await actorLabel(session.userId),
    entityType: "FORM_SUBMISSION",
    entityId: id,
    message: "Updated the entry",
    meta: { changes: [{ label: field.label, from, to }] },
  });
  revalidatePath(`/forms/${sub.formId}/entries`);
  return { ok: true };
}

/** Delete an entry — a form manager, or the person who submitted it. */
export async function deleteSubmission(id: string): Promise<FormActionState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  const sub = await prisma.formSubmission.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: { id: true, formId: true, submittedByUserId: true },
  });
  if (!sub) return { error: "Entry not found." };
  const manage = await canManageForms(session);
  if (!manage && sub.submittedByUserId !== session.userId) {
    return { error: "You can't delete this entry." };
  }
  await prisma.formSubmission.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: session.userId },
  });
  revalidatePath(`/forms/${sub.formId}/entries`);
  return { ok: true };
}
