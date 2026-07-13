import "server-only";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";

/**
 * Notify newly-assigned employees of a task. Routes through the central notify()
 * so each recipient gets the in-app bell, a Web Push, and (if they've opted into
 * task emails) an email — all best-effort. Never throws, so creating/assigning a
 * task never fails because a notification channel is down. The assigner is never
 * notified about their own self-assignment.
 */
export async function notifyTaskAssigned(opts: {
  companyId: string;
  taskId: string;
  employeeIds: string[];
  assignerUserId: string;
}): Promise<void> {
  const { companyId, taskId, assignerUserId } = opts;
  const ids = [...new Set(opts.employeeIds.filter(Boolean))];
  if (ids.length === 0) return;

  try {
    const [task, employees, assigner] = await Promise.all([
      prisma.task.findFirst({
        where: { id: taskId, project: { companyId } },
        select: { name: true, project: { select: { name: true } } },
      }),
      prisma.employee.findMany({
        where: { id: { in: ids }, companyId, deletedAt: null },
        select: { user: { select: { id: true } } },
      }),
      prisma.user.findUnique({
        where: { id: assignerUserId },
        select: { email: true, employee: { select: { fullName: true } } },
      }),
    ]);
    if (!task) return;

    const assignerName = assigner?.employee?.fullName ?? assigner?.email ?? "Someone";

    // Only employees who have a login, and never the assigner themselves.
    const noteUserIds = employees
      .map((e) => e.user?.id)
      .filter((x): x is string => !!x && x !== assignerUserId);
    if (!noteUserIds.length) return;

    await notify(noteUserIds, {
      type: "TASK",
      title: "New task assigned",
      body: `${assignerName} assigned you "${task.name}" in ${task.project.name}.`,
      meta: { taskId },
    });
  } catch {
    /* never block assignment on a notification failure */
  }
}

/**
 * Notify a project's client team that a task is now visible to them in the
 * portal (created client-visible, or toggled on). Best-effort; never throws.
 */
export async function notifyClientTask(opts: {
  companyId: string;
  taskId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const task = await prisma.task.findFirst({
      where: { id: opts.taskId, project: { companyId: opts.companyId } },
      select: { name: true, project: { select: { name: true, clientId: true } } },
    });
    if (!task?.project.clientId) return;
    const clientUsers = await prisma.user.findMany({
      where: { clientId: task.project.clientId, companyId: opts.companyId, role: "CLIENT", isActive: true },
      select: { id: true },
    });
    const ids = clientUsers.map((u) => u.id).filter((id) => id !== opts.actorUserId);
    if (!ids.length) return;
    await notify(ids, {
      type: "TASK",
      title: "New task on your project",
      body: `${task.project.name}: “${task.name}” was shared with you.`,
      meta: { taskId: opts.taskId },
    });
  } catch {
    /* never block on a notification failure */
  }
}
