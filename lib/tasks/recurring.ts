import "server-only";
import type { Priority } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateAtUTC } from "@/lib/dates";
import { notifyTaskAssigned } from "@/lib/tasks/assign-notify";

/** The template fields needed to spawn a task instance. */
export type RecurringTemplate = {
  id: string;
  companyId: string;
  projectId: string;
  serviceId: string | null;
  name: string;
  description: string | null;
  priority: Priority;
  assigneeIds: unknown; // Json string[]
  dueInDays: number | null;
  clientDeadlineInDays: number | null;
  checklistEnabled: boolean;
  createdById: string | null;
};

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function nextTaskNumber(companyId: string): Promise<number> {
  const c = await prisma.company.update({
    where: { id: companyId },
    data: { taskSeq: { increment: 1 } },
    select: { taskSeq: true },
  });
  return c.taskSeq;
}

/**
 * Create one task instance from a recurring template for the given occurrence
 * date. Dates are recomputed relative to `dateISO` (dueInDays / clientDeadlineInDays);
 * everything else is copied. Seeds the checklist from the sub-category template
 * and notifies the assignees. Returns the new task id, or null if the project is
 * gone. Best-effort — never throws in a way that should abort the cron sweep.
 */
export async function createTaskFromRecurring(
  rt: RecurringTemplate,
  dateISO: string,
): Promise<string | null> {
  const project = await prisma.project.findFirst({
    where: { id: rt.projectId, companyId: rt.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!project) return null;

  const wantIds = Array.isArray(rt.assigneeIds)
    ? (rt.assigneeIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  let assigneeIds: string[] = [];
  if (wantIds.length) {
    const valid = await prisma.employee.findMany({
      where: { id: { in: [...new Set(wantIds)] }, companyId: rt.companyId, deletedAt: null },
      select: { id: true },
    });
    assigneeIds = valid.map((e) => e.id);
  }

  const dueDate = rt.dueInDays != null ? dateAtUTC(addDaysISO(dateISO, rt.dueInDays)) : null;
  const clientDeadline =
    rt.clientDeadlineInDays != null ? dateAtUTC(addDaysISO(dateISO, rt.clientDeadlineInDays)) : null;

  const taskNumber = await nextTaskNumber(rt.companyId);
  const task = await prisma.task.create({
    data: {
      projectId: rt.projectId,
      name: rt.name,
      description: rt.description,
      serviceId: rt.serviceId,
      taskNumber,
      createdById: rt.createdById,
      status: "TODO",
      priority: rt.priority,
      checklistEnabled: rt.checklistEnabled,
      dueDate,
      clientDeadline,
      assignees: assigneeIds.length
        ? { create: assigneeIds.map((employeeId) => ({ employeeId })) }
        : undefined,
    },
    select: { id: true },
  });

  // Seed the checklist from the sub-category's default template (same as a
  // normal new task), unless the template opted out of a checklist.
  if (rt.checklistEnabled && rt.serviceId) {
    const template = await prisma.serviceChecklistItem.findMany({
      where: { serviceId: rt.serviceId },
      orderBy: { orderIndex: "asc" },
      select: { text: true },
    });
    if (template.length) {
      await prisma.checklistItem.createMany({
        data: template.map((c, i) => ({
          taskId: task.id,
          text: c.text,
          orderIndex: i,
          createdById: rt.createdById,
        })),
      });
    }
  }

  if (assigneeIds.length && rt.createdById) {
    await notifyTaskAssigned({
      companyId: rt.companyId,
      taskId: task.id,
      employeeIds: assigneeIds,
      assignerUserId: rt.createdById,
    }).catch(() => {});
  }

  return task.id;
}
