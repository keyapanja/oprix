import "server-only";
import { prisma } from "@/lib/db";
import { getCompanyTimezone } from "@/lib/cache";
import { dateAtUTC, dateISOInZone } from "@/lib/dates";
import { notify } from "@/lib/notifications/notify";

/**
 * Bank a single live run into the user's PENDING timesheet entry.
 * Returns the seconds banked (0 when the timer wasn't actively running).
 *
 * `endAt` is when the run is treated as having stopped — "now" for a normal
 * pause, but an earlier cutoff for auto-pause, which may run days after the
 * fact. It drives both the duration banked *and* the date of the timesheet
 * entry, so capped hours land on the day they were worked rather than the day
 * the job happened to fire.
 */
async function bankRun(
  companyId: string,
  userId: string,
  taskId: string,
  projectId: string,
  runStartedAt: Date | null,
  endAt: Date = new Date(),
): Promise<number> {
  const runSeconds = runStartedAt
    ? Math.max(0, Math.floor((endAt.getTime() - runStartedAt.getTime()) / 1000))
    : 0;
  if (runSeconds <= 0) return 0;

  const [tz, user] = await Promise.all([
    getCompanyTimezone(companyId),
    prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } }),
  ]);
  const date = dateAtUTC(dateISOInZone(tz, endAt));
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
 * Stop EVERY user's timer on a task (bank each live run, then remove the rows).
 * Used when a task leaves a work state via the review workflow, so a multi-assignee
 * task doesn't leave a co-worker's timer banking time after submit/approve.
 */
export async function finalizeAllTaskTimers(companyId: string, taskId: string): Promise<void> {
  const timers = await prisma.taskTimer.findMany({
    where: { taskId },
    select: { userId: true, runStartedAt: true, task: { select: { projectId: true } } },
  });
  if (timers.length === 0) return;
  for (const t of timers) {
    await bankRun(companyId, t.userId, taskId, t.task.projectId, t.runStartedAt);
  }
  await prisma.taskTimer.deleteMany({ where: { taskId } });
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
 * A single uninterrupted run longer than this is treated as forgotten rather
 * than worked.
 *
 * Note this sits at roughly one working day, so it can clip a genuine case:
 * someone who runs one task's timer straight through without ever pausing gets
 * capped here and loses the excess. That's the intended trade — a forgotten
 * timer costs more than an occasional trimmed hour — but raise it if people
 * legitimately track single unbroken stretches longer than this.
 */
export const MAX_RUN_HOURS = 8;

/**
 * Safety net for timers nobody stopped: pause any run that has been going for
 * more than `maxRunHours`, banking exactly that cap and no more.
 *
 * This is the only thing that catches the cases a browser prompt cannot — a
 * crash, a force-quit, a closed laptop, or simply going home on Friday — none
 * of which fire `beforeunload`.
 *
 * The cap is measured from `runStartedAt`, NOT from now, which is what makes it
 * safe to run late: the external scheduler isn't wired yet, so this may not fire
 * until someone next opens the app. Banking to "now" would push an entire
 * weekend into a timesheet (and from there into payroll); banking to the cutoff
 * yields the same result whenever it runs.
 *
 * Idempotent: once paused, a timer no longer matches the query. Resuming starts
 * a fresh run, which gets its own cap.
 *
 * Returns the number of timers paused.
 */
export async function autoPauseStaleTimers(
  companyId: string,
  maxRunHours: number = MAX_RUN_HOURS,
): Promise<number> {
  const maxMs = maxRunHours * 60 * 60 * 1000;
  const startedBefore = new Date(Date.now() - maxMs);

  const stale = await prisma.taskTimer.findMany({
    where: {
      companyId,
      status: "RUNNING",
      runStartedAt: { not: null, lt: startedBefore },
    },
    select: {
      id: true,
      userId: true,
      taskId: true,
      accumulatedSeconds: true,
      runStartedAt: true,
      task: { select: { projectId: true, name: true } },
    },
  });
  if (stale.length === 0) return 0;

  let paused = 0;
  for (const t of stale) {
    if (!t.runStartedAt) continue; // narrowing; the query already excludes nulls
    try {
      const endAt = new Date(t.runStartedAt.getTime() + maxMs);
      const banked = await bankRun(companyId, t.userId, t.taskId, t.task.projectId, t.runStartedAt, endAt);
      await prisma.taskTimer.update({
        where: { id: t.id },
        data: {
          status: "PAUSED",
          accumulatedSeconds: t.accumulatedSeconds + banked,
          runStartedAt: null,
        },
      });
      paused += 1;
      // Tell the person — a silent edit to their timesheet is worse than the
      // runaway timer was. Best-effort: a failed notify must not stop the pause.
      await notify([t.userId], {
        type: "TASK",
        title: "Timer auto-paused",
        body: `Your timer on “${t.task.name}” ran for over ${maxRunHours} hours, so it was paused and logged as ${maxRunHours} hours. Check your timesheet if that isn't right.`,
        meta: { taskId: t.taskId },
      });
    } catch (e) {
      console.error(`[timer] auto-pause failed for timer ${t.id}:`, e);
    }
  }
  return paused;
}

/**
 * Whether a person may run the timer on a task right now: an assignee (the
 * worker) while the task is in a WORK state (To Do / In Progress / Redo). Once
 * the task is submitted (Review onward) the timer is finalized and shown
 * read-only everywhere — the worker's tracking is done.
 */
export function canUseTimer(status: string, isAssignee: boolean, _isReviewer: boolean): boolean {
  const workStates =
    status === "TODO" || status === "IN_PROGRESS" || status === "REDO" || status === "HOLD";
  return isAssignee && workStates;
}
