import "server-only";
import { prisma } from "@/lib/db";
import type { ActiveTimer } from "@/lib/timer/shared";

/** All live (running + paused) timers for an employee, for the global bar. */
export async function getActiveTimers(employeeId: string): Promise<ActiveTimer[]> {
  const rows = await prisma.taskTimer.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
    select: {
      taskId: true,
      status: true,
      accumulatedSeconds: true,
      runStartedAt: true,
      task: {
        select: { name: true, projectId: true, project: { select: { name: true } } },
      },
    },
  });
  return rows.map((r) => ({
    taskId: r.taskId,
    taskName: r.task.name,
    projectId: r.task.projectId,
    projectName: r.task.project.name,
    status: r.status,
    baseSeconds: r.accumulatedSeconds,
    runStartedAtMs: r.runStartedAt ? r.runStartedAt.getTime() : null,
  }));
}

/** The current employee's timer for one task (for the task-detail control). */
export async function getMyTaskTimer(employeeId: string, taskId: string) {
  const t = await prisma.taskTimer.findUnique({
    where: { taskId_employeeId: { taskId, employeeId } },
    select: { status: true, accumulatedSeconds: true, runStartedAt: true },
  });
  if (!t) return { status: "NONE" as const, baseSeconds: 0, runStartedAtMs: null };
  return {
    status: t.status,
    baseSeconds: t.accumulatedSeconds,
    runStartedAtMs: t.runStartedAt ? t.runStartedAt.getTime() : null,
  };
}

/**
 * Total time tracked on a task so far, in seconds: finalized timesheet hours
 * plus any in-progress timers (banked + current run, snapshot at call time).
 */
export async function taskTrackedSeconds(taskId: string): Promise<number> {
  const [agg, timers] = await Promise.all([
    prisma.timeEntry.aggregate({ where: { taskId }, _sum: { hours: true } }),
    prisma.taskTimer.findMany({
      where: { taskId },
      select: { accumulatedSeconds: true, runStartedAt: true },
    }),
  ]);
  const finalized = (agg._sum.hours ?? 0) * 3600;
  const now = Date.now();
  const live = timers.reduce(
    (sum, t) =>
      sum +
      t.accumulatedSeconds +
      (t.runStartedAt ? Math.max(0, Math.floor((now - t.runStartedAt.getTime()) / 1000)) : 0),
    0,
  );
  return Math.round(finalized + live);
}
