"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Priority } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { ScheduleZ } from "@/lib/forms/schedule";
import { createTaskFromRecurring } from "@/lib/tasks/recurring";
import { nowInZone } from "@/lib/dates";

export type RecurringState = { error?: string; ok?: boolean; id?: string };

const RecurringInputZ = z.object({
  projectId: z.string().min(1, "Pick a project"),
  serviceId: z.string().min(1).optional().nullable(),
  name: z.string().trim().min(1, "Give the task a name").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.nativeEnum(Priority).default("MEDIUM"),
  assigneeIds: z.array(z.string()).default([]),
  dueInDays: z.number().int().min(0).max(3650).optional().nullable(),
  clientDeadlineInDays: z.number().int().min(0).max(3650).optional().nullable(),
  checklistEnabled: z.boolean().default(true),
  schedule: ScheduleZ,
});

export type RecurringInput = z.infer<typeof RecurringInputZ>;

/** Create a recurring-task template. Gated on task:manage. */
export async function createRecurringTask(input: RecurringInput): Promise<RecurringState> {
  const session = await requireCapability("task:manage");
  const parsed = RecurringInputZ.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  // The project must belong to the company.
  const project = await prisma.project.findFirst({
    where: { id: d.projectId, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  // Keep only assignees that really belong to the company.
  let assigneeIds: string[] = [];
  if (d.assigneeIds.length) {
    const valid = await prisma.employee.findMany({
      where: { id: { in: [...new Set(d.assigneeIds)] }, companyId: session.companyId, deletedAt: null },
      select: { id: true },
    });
    assigneeIds = valid.map((e) => e.id);
  }

  const rt = await prisma.recurringTask.create({
    data: {
      companyId: session.companyId,
      projectId: d.projectId,
      serviceId: d.serviceId ?? null,
      name: d.name,
      description: d.description ?? null,
      priority: d.priority,
      assigneeIds,
      dueInDays: d.dueInDays ?? null,
      clientDeadlineInDays: d.clientDeadlineInDays ?? null,
      checklistEnabled: d.checklistEnabled,
      schedule: d.schedule,
      createdById: session.userId,
    },
    select: { id: true },
  });

  revalidatePath("/tasks/recurring");
  return { ok: true, id: rt.id };
}

/** Pause / resume a recurring template. Gated on task:manage. */
export async function toggleRecurringTask(id: string, active: boolean): Promise<RecurringState> {
  const session = await requireCapability("task:manage");
  const res = await prisma.recurringTask.updateMany({
    where: { id, companyId: session.companyId },
    data: { active },
  });
  if (res.count !== 1) return { error: "Not found" };
  revalidatePath("/tasks/recurring");
  return { ok: true, id };
}

/** Delete a recurring template. Already-created task instances are untouched. */
export async function deleteRecurringTask(id: string): Promise<RecurringState> {
  const session = await requireCapability("task:manage");
  const res = await prisma.recurringTask.deleteMany({
    where: { id, companyId: session.companyId },
  });
  if (res.count !== 1) return { error: "Not found" };
  revalidatePath("/tasks/recurring");
  return { ok: true, id };
}

/**
 * Spawn a task from a template right now (manual "run once"), regardless of the
 * schedule. Does NOT touch lastRunKey, so it never blocks the scheduled fire.
 */
export async function runRecurringNow(id: string): Promise<RecurringState> {
  const session = await requireCapability("task:manage");
  const rt = await prisma.recurringTask.findFirst({
    where: { id, companyId: session.companyId },
  });
  if (!rt) return { error: "Not found" };

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { timezone: true },
  });
  const { dateISO } = nowInZone(company?.timezone ?? "Asia/Kolkata");

  const taskId = await createTaskFromRecurring(rt, dateISO);
  if (!taskId) return { error: "Could not create the task (project missing?)" };

  revalidatePath("/tasks/recurring");
  revalidatePath("/tasks");
  return { ok: true, id: taskId };
}
