import "server-only";
import { prisma } from "@/lib/db";
import type { ActiveTimer, TaskTimerState } from "@/lib/timer/shared";

/** Seconds a user has logged to the timesheet for a task. */
async function loggedSeconds(userId: string, taskId: string): Promise<number> {
  const agg = await prisma.timeEntry.aggregate({
    where: { userId, taskId },
    _sum: { hours: true },
  });
  return Math.round((agg._sum.hours ?? 0) * 3600);
}

/**
 * Active timers (running AND paused) for a user, for the global bar. A timer
 * stays here until it's finalized (the task leaves a timeable state), so the
 * user can pause/resume it from any page.
 */
export async function getActiveTimers(userId: string): Promise<ActiveTimer[]> {
  const rows = await prisma.taskTimer.findMany({
    where: { userId },
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

/**
 * The user's timer state for one task: RUNNING if live, PAUSED (resumable) if
 * there's logged time but no live run, otherwise NONE.
 */
export async function getMyTaskTimer(userId: string, taskId: string): Promise<TaskTimerState> {
  const t = await prisma.taskTimer.findUnique({
    where: { taskId_userId: { taskId, userId } },
    select: { status: true, accumulatedSeconds: true, runStartedAt: true },
  });
  if (t && t.status === "RUNNING") {
    return {
      status: "RUNNING",
      baseSeconds: t.accumulatedSeconds,
      runStartedAtMs: t.runStartedAt ? t.runStartedAt.getTime() : null,
    };
  }
  const logged = await loggedSeconds(userId, taskId);
  return logged > 0
    ? { status: "PAUSED", baseSeconds: logged, runStartedAtMs: null }
    : { status: "NONE", baseSeconds: 0, runStartedAtMs: null };
}

/** Timer state for many tasks at once (task list): running, resumable, or none. */
export async function getTaskTimerStates(
  userId: string,
  taskIds: string[],
): Promise<Map<string, TaskTimerState>> {
  const map = new Map<string, TaskTimerState>();
  if (taskIds.length === 0) return map;

  const [running, logged] = await Promise.all([
    prisma.taskTimer.findMany({
      where: { userId, taskId: { in: taskIds }, status: "RUNNING" },
      select: { taskId: true, accumulatedSeconds: true, runStartedAt: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["taskId"],
      where: { userId, taskId: { in: taskIds } },
      _sum: { hours: true },
    }),
  ]);

  for (const t of running) {
    map.set(t.taskId, {
      status: "RUNNING",
      baseSeconds: t.accumulatedSeconds,
      runStartedAtMs: t.runStartedAt ? t.runStartedAt.getTime() : null,
    });
  }
  for (const g of logged) {
    if (!g.taskId || map.has(g.taskId)) continue;
    const secs = Math.round((g._sum.hours ?? 0) * 3600);
    if (secs > 0) map.set(g.taskId, { status: "PAUSED", baseSeconds: secs, runStartedAtMs: null });
  }
  return map;
}

/**
 * Total time tracked on a task so far (everyone), in seconds: logged timesheet
 * hours plus the live portion of any currently-running timers.
 */
export async function taskTrackedSeconds(taskId: string): Promise<number> {
  const [agg, running] = await Promise.all([
    prisma.timeEntry.aggregate({ where: { taskId }, _sum: { hours: true } }),
    prisma.taskTimer.findMany({
      where: { taskId, status: "RUNNING" },
      select: { runStartedAt: true },
    }),
  ]);
  const logged = (agg._sum.hours ?? 0) * 3600;
  const now = Date.now();
  const live = running.reduce(
    (sum, t) => sum + (t.runStartedAt ? Math.max(0, Math.floor((now - t.runStartedAt.getTime()) / 1000)) : 0),
    0,
  );
  return Math.round(logged + live);
}

export type TaskRunner = {
  userId: string;
  name: string;
  baseSeconds: number;
  runStartedAtMs: number;
};

/**
 * Everyone currently running a live timer on this task — so ALL viewers (not
 * just the owner) can see who's actively working and for how long. The client
 * ticks the elapsed time from runStartedAtMs.
 */
export async function getTaskRunningTimers(taskId: string): Promise<TaskRunner[]> {
  const rows = await prisma.taskTimer.findMany({
    where: { taskId, status: "RUNNING" },
    orderBy: { runStartedAt: "asc" },
    select: { userId: true, accumulatedSeconds: true, runStartedAt: true },
  });
  const running = rows.filter((r): r is typeof r & { runStartedAt: Date } => !!r.runStartedAt);
  if (running.length === 0) return [];

  // TaskTimer has no user relation — resolve names in one lookup.
  const users = await prisma.user.findMany({
    where: { id: { in: running.map((r) => r.userId) } },
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  });
  const nameOf = (uid: string) => {
    const u = users.find((x) => x.id === uid);
    return u?.employee?.fullName ?? u?.email ?? "Someone";
  };

  return running.map((r) => ({
    userId: r.userId,
    name: nameOf(r.userId),
    baseSeconds: r.accumulatedSeconds,
    runStartedAtMs: r.runStartedAt.getTime(),
  }));
}
