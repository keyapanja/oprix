import "server-only";
import { prisma } from "@/lib/db";
import { nowInZone, dateAtUTC } from "@/lib/dates";

/**
 * Stop a user's running timer on a task and bank the run into the timesheet.
 * Time tracking is user-scoped (any user — worker or reviewer), and the entry is
 * also tagged with their employeeId when they have one. Returns seconds logged
 * (null if there was no running timer).
 */
export async function finalizeTaskTimer(
  companyId: string,
  userId: string,
  taskId: string,
): Promise<number | null> {
  const timer = await prisma.taskTimer.findUnique({
    where: { taskId_userId: { taskId, userId } },
    select: { id: true, runStartedAt: true, task: { select: { projectId: true } } },
  });
  if (!timer) return null;

  const runSeconds = timer.runStartedAt
    ? Math.max(0, Math.floor((Date.now() - timer.runStartedAt.getTime()) / 1000))
    : 0;

  if (runSeconds > 0) {
    const [company, user] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } }),
    ]);
    const date = dateAtUTC(nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO);
    const hours = runSeconds / 3600;
    const existing = await prisma.timeEntry.findFirst({
      where: { userId, taskId, date, status: "PENDING" },
      select: { id: true, hours: true },
    });
    if (existing) {
      await prisma.timeEntry.update({ where: { id: existing.id }, data: { hours: existing.hours + hours } });
    } else {
      await prisma.timeEntry.create({
        data: {
          companyId,
          userId,
          employeeId: user?.employeeId ?? null,
          projectId: timer.task.projectId,
          taskId,
          date,
          hours,
          notes: "Tracked via timer",
        },
      });
    }
  }

  await prisma.taskTimer.delete({ where: { id: timer.id } });
  return runSeconds;
}

/**
 * Whether a person may run the timer on a task right now:
 * - an assignee (the worker) while the task is theirs to work on, or
 * - the creator (the reviewer) while it's waiting for review.
 */
export function canUseTimer(status: string, isAssignee: boolean, isReviewer: boolean): boolean {
  const workStates = status === "TODO" || status === "IN_PROGRESS" || status === "REDO";
  return (isAssignee && workStates) || (isReviewer && status === "REVIEW");
}
