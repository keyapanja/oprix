import "server-only";
import { prisma } from "@/lib/db";
import { getCompanyTimezone } from "@/lib/cache";
import { nowInZone, dateAtUTC } from "@/lib/dates";

/**
 * Bank a single live run into the user's PENDING timesheet entry for today.
 * Returns the seconds banked (0 when the timer wasn't actively running).
 */
async function bankRun(
  companyId: string,
  userId: string,
  taskId: string,
  projectId: string,
  runStartedAt: Date | null,
): Promise<number> {
  const runSeconds = runStartedAt
    ? Math.max(0, Math.floor((Date.now() - runStartedAt.getTime()) / 1000))
    : 0;
  if (runSeconds <= 0) return 0;

  const [tz, user] = await Promise.all([
    getCompanyTimezone(companyId),
    prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } }),
  ]);
  const date = dateAtUTC(nowInZone(tz).dateISO);
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
        projectId,
        taskId,
        date,
        hours,
        notes: "Tracked via timer",
      },
    });
  }
  return runSeconds;
}

/**
 * Stop a user's timer on a task: bank any live run into the timesheet and remove
 * the timer row entirely. Used when the task leaves a timeable state (e.g. moved
 * to review/completed). Returns seconds logged (null if there was no timer).
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

  const runSeconds = await bankRun(companyId, userId, taskId, timer.task.projectId, timer.runStartedAt);
  await prisma.taskTimer.delete({ where: { id: timer.id } });
  return runSeconds;
}

/**
 * Pause a user's timer: bank the current run into the timesheet but KEEP the
 * timer row (status PAUSED) so it stays in the global bar and can be resumed
 * from anywhere. Returns seconds banked (null if there was no timer).
 */
export async function pauseTaskTimer(
  companyId: string,
  userId: string,
  taskId: string,
): Promise<number | null> {
  const timer = await prisma.taskTimer.findUnique({
    where: { taskId_userId: { taskId, userId } },
    select: {
      id: true,
      status: true,
      accumulatedSeconds: true,
      runStartedAt: true,
      task: { select: { projectId: true } },
    },
  });
  if (!timer) return null;
  if (timer.status !== "RUNNING") return 0; // already paused

  const runSeconds = await bankRun(companyId, userId, taskId, timer.task.projectId, timer.runStartedAt);
  await prisma.taskTimer.update({
    where: { id: timer.id },
    data: {
      status: "PAUSED",
      accumulatedSeconds: timer.accumulatedSeconds + runSeconds, // banked total for display
      runStartedAt: null,
    },
  });
  return runSeconds;
}

/**
 * Whether a person may run the timer on a task right now: an assignee (the
 * worker) while the task is in a WORK state (To Do / In Progress / Redo). Once
 * the task is submitted (Review onward) the timer is finalized and shown
 * read-only everywhere — the worker's tracking is done.
 */
export function canUseTimer(status: string, isAssignee: boolean, _isReviewer: boolean): boolean {
  const workStates = status === "TODO" || status === "IN_PROGRESS" || status === "REDO";
  return isAssignee && workStates;
}
