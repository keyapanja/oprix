"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { nowInZone, dateAtUTC } from "@/lib/dates";

export type TimerState = { ok?: boolean; error?: string };

type Sess = NonNullable<Awaited<ReturnType<typeof getSession>>>;

// A task (company-scoped) the current employee may track time on: they manage
// tasks, or they're assigned to it.
async function accessibleTask(session: Sess, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { id: true, projectId: true, assignees: { select: { employeeId: true } } },
  });
  if (!task) return null;
  const isManager = await hasPermission(session.companyId, session.role, "task:manage");
  const isAssignee =
    !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  return isManager || isAssignee ? task : null;
}

function bankedSeconds(t: {
  accumulatedSeconds: number;
  runStartedAt: Date | null;
}, now: Date): number {
  const run = t.runStartedAt
    ? Math.max(0, Math.floor((now.getTime() - t.runStartedAt.getTime()) / 1000))
    : 0;
  return t.accumulatedSeconds + run;
}

/** Start a fresh timer, or resume a paused one, for the current employee. */
export async function startTimer(taskId: string): Promise<TimerState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  if (!session.employeeId) return { error: "Only employees can track time" };
  if (!(await accessibleTask(session, taskId))) return { error: "No access to this task" };

  const existing = await prisma.taskTimer.findUnique({
    where: { taskId_employeeId: { taskId, employeeId: session.employeeId } },
    select: { id: true, status: true },
  });

  if (existing) {
    if (existing.status === "RUNNING") return { ok: true };
    await prisma.taskTimer.update({
      where: { id: existing.id },
      data: { status: "RUNNING", runStartedAt: new Date() },
    });
  } else {
    await prisma.taskTimer.create({
      data: {
        companyId: session.companyId,
        taskId,
        employeeId: session.employeeId,
        status: "RUNNING",
        runStartedAt: new Date(),
      },
    });
  }
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/** Pause a running timer, banking the current run into accumulatedSeconds. */
export async function pauseTimer(taskId: string): Promise<TimerState> {
  const session = await getSession();
  if (!session?.employeeId) return { error: "Not authenticated" };

  const timer = await prisma.taskTimer.findUnique({
    where: { taskId_employeeId: { taskId, employeeId: session.employeeId } },
    select: { id: true, status: true, accumulatedSeconds: true, runStartedAt: true },
  });
  if (!timer) return { error: "No active timer" };
  if (timer.status === "PAUSED") return { ok: true };

  await prisma.taskTimer.update({
    where: { id: timer.id },
    data: { status: "PAUSED", accumulatedSeconds: bankedSeconds(timer, new Date()), runStartedAt: null },
  });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/** Stop a timer: finalize the total into a timesheet TimeEntry and clear it. */
export async function stopTimer(taskId: string): Promise<TimerState> {
  const session = await getSession();
  if (!session?.employeeId) return { error: "Not authenticated" };

  const timer = await prisma.taskTimer.findUnique({
    where: { taskId_employeeId: { taskId, employeeId: session.employeeId } },
    select: {
      id: true,
      accumulatedSeconds: true,
      runStartedAt: true,
      task: { select: { projectId: true } },
    },
  });
  if (!timer) return { error: "No active timer" };

  const totalSeconds = bankedSeconds(timer, new Date());

  if (totalSeconds > 0) {
    const company = await prisma.company.findUnique({
      where: { id: session.companyId },
      select: { timezone: true },
    });
    const date = dateAtUTC(nowInZone(company?.timezone ?? "Asia/Kolkata").dateISO);
    const hours = totalSeconds / 3600;

    // Aggregate into the day's pending timesheet row for this task, if present.
    const existing = await prisma.timeEntry.findFirst({
      where: { employeeId: session.employeeId, taskId, date, status: "PENDING" },
      select: { id: true, hours: true },
    });
    if (existing) {
      await prisma.timeEntry.update({
        where: { id: existing.id },
        data: { hours: existing.hours + hours },
      });
    } else {
      await prisma.timeEntry.create({
        data: {
          companyId: session.companyId,
          employeeId: session.employeeId,
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
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}
