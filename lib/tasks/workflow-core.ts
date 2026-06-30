import "server-only";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { logTaskActivity, actorLabel } from "@/lib/activity";
import { finalizeAllTaskTimers } from "@/lib/timer/finalize";
import { normalizeHttpUrl, looksLikeUrl } from "@/lib/url";

// Session-agnostic "submit for review" — shared by the web Server Action
// (lib/tasks/workflow.ts) and the extension API. The worker submits a final
// output/preview link; the task moves to REVIEW and the reviewer is notified.

export type WorkflowState = { ok?: boolean; error?: string };

export async function submitForReviewFor(
  session: SessionUser,
  taskId: string,
  finalLink: string,
): Promise<WorkflowState> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null, project: { companyId: session.companyId } },
    select: {
      id: true,
      name: true,
      status: true,
      createdById: true,
      assignees: { select: { employeeId: true } },
    },
  });
  if (!task) return { error: "Task not found" };

  // Base employees hold task:manage; the reviewer override must be elevated
  // (project:manage), matching the web flow.
  const isElevated = await hasPermission(session.companyId, session.role, "project:manage");
  const isAssignee =
    !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  if (!isAssignee && !isElevated) return { error: "Only an assignee can submit this task." };
  if (!["TODO", "IN_PROGRESS", "REDO"].includes(task.status)) {
    return { error: "This task can't be submitted from its current status." };
  }
  const raw = finalLink.trim();
  if (!raw) return { error: "Add the final link or a status note before submitting." };
  // The field accepts either a link or plain status text. Links are normalized
  // to a safe http(s) form; anything else is stored verbatim (capped).
  const value = looksLikeUrl(raw) ? (normalizeHttpUrl(raw) ?? raw.slice(0, 1000)) : raw.slice(0, 1000);

  await finalizeAllTaskTimers(session.companyId, taskId);
  await prisma.task.update({ where: { id: taskId }, data: { status: "REVIEW", finalLink: value } });

  const actor = await actorLabel(session.userId);
  if (task.createdById && task.createdById !== session.userId) {
    await prisma.notification.create({
      data: {
        userId: task.createdById,
        type: "TASK",
        title: "Task ready for review",
        body: `${actor} submitted “${task.name}” for review`,
        meta: { taskId },
      },
    });
  }
  await logTaskActivity(session, taskId, "submitted the work for review");
  return { ok: true };
}
