"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { logTaskActivity, actorLabel } from "@/lib/activity";
import { finalizeTaskTimer, finalizeAllTaskTimers } from "@/lib/timer/finalize";
import { submitForReviewFor } from "@/lib/tasks/workflow-core";
import { notify as notifyUsers } from "@/lib/notifications/notify";

export type WorkflowState = { ok?: boolean; error?: string };

type Sess = NonNullable<Awaited<ReturnType<typeof getSession>>>;

async function loadTask(session: Sess, taskId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
    select: {
      id: true,
      name: true,
      status: true,
      finalLink: true,
      createdById: true,
      projectId: true,
      assignees: {
        select: { employeeId: true, employee: { select: { user: { select: { id: true } } } } },
      },
    },
  });
}
type LoadedTask = NonNullable<Awaited<ReturnType<typeof loadTask>>>;

function assigneeUserIds(task: LoadedTask): string[] {
  return task.assignees.map((a) => a.employee.user?.id).filter((x): x is string => !!x);
}

async function notify(userIds: string[], title: string, body: string, taskId: string, exclude?: string) {
  const targets = [...new Set(userIds)].filter((u) => u !== exclude);
  if (targets.length === 0) return;
  // Central fan-out: in-app bell + Web Push + (pref-gated) email.
  await notifyUsers(targets, { type: "TASK", title, body, meta: { taskId } });
}

async function ctx(session: Sess, task: LoadedTask) {
  // Base employees hold task:manage (they get the Tasks module), so the reviewer
  // override must be an elevated role — project:manage (admins / project managers).
  const isElevated = await hasPermission(session.companyId, session.role, "project:manage");
  const isAssignee = !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  const isReviewer = session.userId === task.createdById;
  return { isElevated, isAssignee, isReviewer };
}

/** Worker submits the work (with a final output/preview link) for review.
 *  Logic lives in lib/tasks/workflow-core so the extension API reuses it. */
export async function submitForReview(taskId: string, finalLink: string): Promise<WorkflowState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const res = await submitForReviewFor(session, taskId, finalLink);
  if (res.ok) {
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/tasks");
  }
  return res;
}

/** Reviewer requests changes → Redo. The submitted link is archived to history and cleared. */
export async function requestChanges(taskId: string): Promise<WorkflowState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const task = await loadTask(session, taskId);
  if (!task) return { error: "Task not found" };
  const { isElevated, isReviewer } = await ctx(session, task);

  if (!isReviewer && !isElevated) return { error: "Only the reviewer can request changes." };
  if (!["REVIEW", "CLIENT_REVIEW"].includes(task.status)) {
    return { error: "Changes can only be requested while the task is in review." };
  }

  await finalizeTaskTimer(session.companyId, session.userId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { status: "REDO", finalLink: null } });

  const actor = await actorLabel(session.userId);
  await logTaskActivity(
    session,
    taskId,
    task.finalLink ? `requested changes (previous link: ${task.finalLink})` : "requested changes",
  );
  await notify(assigneeUserIds(task), "Changes requested", `${actor} requested changes on “${task.name}”`, taskId, session.userId);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
}

/** Reviewer approves internally → waiting for client review. */
export async function sendToClientReview(taskId: string): Promise<WorkflowState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const task = await loadTask(session, taskId);
  if (!task) return { error: "Task not found" };
  const { isElevated, isReviewer } = await ctx(session, task);

  if (!isReviewer && !isElevated) return { error: "Only the reviewer can do this." };
  if (task.status !== "REVIEW") return { error: "Only a task waiting for review can move to client review." };

  await finalizeAllTaskTimers(session.companyId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { status: "CLIENT_REVIEW" } });

  const actor = await actorLabel(session.userId);
  await logTaskActivity(session, taskId, "approved internally — sent for client review");
  await notify(assigneeUserIds(task), "Sent for client review", `${actor} sent “${task.name}” for client review`, taskId, session.userId);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
}

/** Reviewer marks the task done. */
export async function approveComplete(taskId: string): Promise<WorkflowState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const task = await loadTask(session, taskId);
  if (!task) return { error: "Task not found" };
  const { isElevated, isReviewer } = await ctx(session, task);

  if (!isReviewer && !isElevated) return { error: "Only the reviewer can complete this task." };
  if (!["REVIEW", "CLIENT_REVIEW"].includes(task.status)) {
    return { error: "Only a task in review can be completed." };
  }

  await finalizeAllTaskTimers(session.companyId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt: new Date() } });

  const actor = await actorLabel(session.userId);
  await logTaskActivity(session, taskId, "marked the task completed");
  await notify(assigneeUserIds(task), "Task completed", `${actor} marked “${task.name}” completed`, taskId, session.userId);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
}

/** Worker pulls their submission back out of review to keep working. Clears the
 *  submitted link and returns the task to In progress. */
export async function withdrawSubmission(taskId: string): Promise<WorkflowState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const task = await loadTask(session, taskId);
  if (!task) return { error: "Task not found" };
  const { isElevated, isAssignee } = await ctx(session, task);

  if (!isAssignee && !isElevated) return { error: "Only an assignee can resume this task." };
  if (task.status !== "REVIEW") {
    return { error: "Only a task waiting for review can be pulled back." };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS", finalLink: null },
  });

  const actor = await actorLabel(session.userId);
  await logTaskActivity(
    session,
    taskId,
    task.finalLink ? `resumed the task (withdrew submission: ${task.finalLink})` : "resumed the task",
  );
  // Let the reviewer (and other assignees) know it's back in progress.
  await notify(
    [task.createdById, ...assigneeUserIds(task)].filter((x): x is string => !!x),
    "Task resumed",
    `${actor} pulled “${task.name}” back from review to keep working`,
    taskId,
    session.userId,
  );
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
}
