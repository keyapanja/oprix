import "server-only";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { logTaskActivity } from "@/lib/activity";
import { fmtDurationShort } from "@/lib/timer/shared";
import { pauseTaskTimer, finalizeTaskTimer, canUseTimer } from "@/lib/timer/finalize";

// ---------------------------------------------------------------------------
// Session-agnostic timer operations — the single source of truth shared by the
// web Server Actions (lib/timer/actions.ts, which add revalidatePath) and the
// extension API (app/api/ext/v1/...). These take an explicit session so they
// work with either a cookie session or a bearer token.
// ---------------------------------------------------------------------------

export type TimerState = { ok?: boolean; error?: string };

/** Seconds this user has already logged to the timesheet for a task. */
async function loggedSeconds(userId: string, taskId: string): Promise<number> {
  const agg = await prisma.timeEntry.aggregate({
    where: { userId, taskId },
    _sum: { hours: true },
  });
  return Math.round((agg._sum.hours ?? 0) * 3600);
}

/** Start or resume the user's timer on a task (gated by the review flow). */
export async function startTimerFor(session: SessionUser, taskId: string): Promise<TimerState> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: {
      id: true,
      status: true,
      startedAt: true,
      createdById: true,
      assignees: { select: { employeeId: true } },
    },
  });
  if (!task) return { error: "Task not found" };

  const isAssignee = !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  const isReviewer = session.userId === task.createdById;
  if (!canUseTimer(task.status, isAssignee, isReviewer)) {
    return { error: "The timer isn't available to you on this task right now." };
  }

  const existing = await prisma.taskTimer.findUnique({
    where: { taskId_userId: { taskId, userId: session.userId } },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "RUNNING") return { ok: true }; // already running
    await prisma.taskTimer.update({
      where: { id: existing.id },
      data: { status: "RUNNING", runStartedAt: new Date() },
    });
    await logTaskActivity(session, taskId, "resumed the timer");
    return { ok: true };
  }

  // A worker starting work moves the task into In Progress.
  if (isAssignee && (task.status === "TODO" || task.status === "REDO")) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? new Date() },
    });
    await logTaskActivity(session, taskId, "moved the task to In Progress");
  }

  const prior = await loggedSeconds(session.userId, taskId);
  await prisma.taskTimer.create({
    data: {
      companyId: session.companyId,
      taskId,
      userId: session.userId,
      status: "RUNNING",
      accumulatedSeconds: prior,
      runStartedAt: new Date(),
    },
  });
  await logTaskActivity(session, taskId, prior > 0 ? "resumed the timer" : "started the timer");
  return { ok: true };
}

/** Pause: bank the live run but keep the (PAUSED) timer row so it can resume. */
export async function pauseTimerFor(session: SessionUser, taskId: string): Promise<TimerState> {
  const runSeconds = await pauseTaskTimer(session.companyId, session.userId, taskId);
  if (runSeconds === null) return { ok: true }; // nothing to pause
  await logTaskActivity(
    session,
    taskId,
    runSeconds > 0 ? `paused the timer · logged ${fmtDurationShort(runSeconds)}` : "paused the timer",
  );
  return { ok: true };
}

/** Stop: bank the live run and remove the timer row entirely. */
export async function stopTimerFor(session: SessionUser, taskId: string): Promise<TimerState> {
  const runSeconds = await finalizeTaskTimer(session.companyId, session.userId, taskId);
  if (runSeconds === null) return { ok: true }; // no timer to stop
  await logTaskActivity(
    session,
    taskId,
    runSeconds > 0 ? `stopped the timer · logged ${fmtDurationShort(runSeconds)}` : "stopped the timer",
  );
  return { ok: true };
}
