"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { logTaskActivity } from "@/lib/activity";
import { fmtDurationShort } from "@/lib/timer/shared";
import { pauseTaskTimer, canUseTimer } from "@/lib/timer/finalize";

export type TimerState = { ok?: boolean; error?: string };

/** Seconds this user has already logged to the timesheet for a task. */
async function loggedSeconds(userId: string, taskId: string): Promise<number> {
  const agg = await prisma.timeEntry.aggregate({
    where: { userId, taskId },
    _sum: { hours: true },
  });
  return Math.round((agg._sum.hours ?? 0) * 3600);
}

/**
 * Start (or resume) tracking. Time tracking is user-scoped, so reviewers without
 * an employee record can track too. Gated by the review flow: the worker may time
 * while the task is theirs (To Do / In Progress / Redo); the reviewer may time
 * while it's waiting for review. A worker starting work auto-moves it to In Progress.
 */
export async function startTimer(taskId: string): Promise<TimerState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

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
    // Resume a paused timer: re-arm the live run. accumulatedSeconds already
    // holds the banked total, so the display continues from where it left off.
    await prisma.taskTimer.update({
      where: { id: existing.id },
      data: { status: "RUNNING", runStartedAt: new Date() },
    });
    await logTaskActivity(session, taskId, "resumed the timer");
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/tasks");
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
      accumulatedSeconds: prior, // resume display from the previously-logged total
      runStartedAt: new Date(),
    },
  });
  await logTaskActivity(session, taskId, prior > 0 ? "resumed the timer" : "started the timer");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
}

/**
 * Pause: bank this run's seconds into the timesheet but keep the timer row
 * (status PAUSED) so it stays in the global bar and can be resumed anywhere.
 */
export async function pauseTimer(taskId: string): Promise<TimerState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const runSeconds = await pauseTaskTimer(session.companyId, session.userId, taskId);
  if (runSeconds === null) return { ok: true }; // nothing to pause

  await logTaskActivity(
    session,
    taskId,
    runSeconds > 0 ? `paused the timer · logged ${fmtDurationShort(runSeconds)}` : "paused the timer",
  );
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
}
