import "server-only";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { logTaskActivity } from "@/lib/activity";

// ---------------------------------------------------------------------------
// Session-agnostic task-edit access + checklist toggle. Shared by the web
// Server Actions (lib/projects/actions.ts) and the extension API. A task can be
// edited by a manager (task:manage) or by one of its assignees.
// ---------------------------------------------------------------------------

export async function canEditTask(session: SessionUser, taskId: string): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { companyId: session.companyId } },
    select: { assignees: { select: { employeeId: true } } },
  });
  if (!task) return false;
  const isManager = await hasPermission(session.companyId, session.role, "task:manage");
  const isAssignee =
    !!session.employeeId && task.assignees.some((a) => a.employeeId === session.employeeId);
  return isManager || isAssignee;
}

export async function toggleChecklistItemFor(
  session: SessionUser,
  itemId: string,
  isDone: boolean,
): Promise<{ ok?: boolean; error?: string; taskId?: string }> {
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, task: { project: { companyId: session.companyId } } },
    select: { taskId: true, text: true },
  });
  if (!item) return { error: "Item not found" };
  if (!(await canEditTask(session, item.taskId))) return { error: "No access" };
  await prisma.checklistItem.update({ where: { id: itemId }, data: { isDone } });
  await logTaskActivity(session, item.taskId, `${isDone ? "checked" : "unchecked"} '${item.text}'`);
  return { ok: true, taskId: item.taskId };
}
