"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { logTaskActivity, actorLabel } from "@/lib/activity";
import { finalizeTaskTimer } from "@/lib/timer/finalize";

export type WorkflowState = { ok?: boolean; error?: string };

type Sess = NonNullable<Awaited<ReturnType<typeof getSession>>>;

async function loadTask(session: Sess, taskId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
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
  await prisma.notification.createMany({
    data: targets.map((userId) => ({ userId, type: "TASK", title, body, meta: { taskId } })),
  });
}

async function ctx(session: Sess, task: LoadedTask) {
  // Base employees hold task:manage (they get the Tasks module), so the reviewer
  // override must be an elevated role — project:manage (admins / project managers).
  const isElevated = await hasPermission(session.companyId, session.role, "project:manage");
  const isAssignee = !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  const isReviewer = session.userId === task.createdById;
  return { isElevated, isAssignee, isReviewer };
}

/** Worker submits the work (with a final output/preview link) for review. */
export async function submitForReview(taskId: string, finalLink: string): Promise<WorkflowState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const task = await loadTask(session, taskId);
  if (!task) return { error: "Task not found" };
  const { isElevated, isAssignee } = await ctx(session, task);

  if (!isAssignee && !isElevated) return { error: "Only an assignee can submit this task." };
  if (!["TODO", "IN_PROGRESS", "REDO"].includes(task.status)) {
    return { error: "This task can't be submitted from its current status." };
  }
  const link = finalLink.trim();
  if (!link) return { error: "Add the final output / preview link before submitting." };

  await finalizeTaskTimer(session.companyId, session.userId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { status: "REVIEW", finalLink: link } });

  const actor = await actorLabel(session.userId);
  if (task.createdById) {
    await notify([task.createdById], "Task ready for review", `${actor} submitted “${task.name}” for review`, taskId, session.userId);
  }
  await logTaskActivity(session, taskId, "submitted the work for review");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
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

  await finalizeTaskTimer(session.companyId, session.userId, taskId);
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

  await finalizeTaskTimer(session.companyId, session.userId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt: new Date() } });

  const actor = await actorLabel(session.userId);
  await logTaskActivity(session, taskId, "marked the task completed");
  await notify(assigneeUserIds(task), "Task completed", `${actor} marked “${task.name}” completed`, taskId, session.userId);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { ok: true };
}
