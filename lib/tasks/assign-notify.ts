import "server-only";
import { prisma } from "@/lib/db";
import { sendTaskAssignedEmail, appUrl } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notifications/notify";

/**
 * Notify newly-assigned employees of a task: an in-app notification (for those
 * who have a login) and an email (to anyone with an address). Best-effort —
 * never throws, so creating/assigning a task never fails because mail is down.
 * The assigner is never notified about their own assignment (self-assign).
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
        select: { name: true, dueDate: true, project: { select: { name: true } } },
      }),
      prisma.employee.findMany({
        where: { id: { in: ids }, companyId, deletedAt: null },
        select: { id: true, fullName: true, email: true, user: { select: { id: true } } },
      }),
      prisma.user.findUnique({
        where: { id: assignerUserId },
        select: { email: true, employee: { select: { fullName: true } } },
      }),
    ]);
    if (!task) return;

    const assignerName = assigner?.employee?.fullName ?? assigner?.email ?? "Someone";
    const projectName = task.project.name;
    const link = appUrl(`/tasks/${taskId}`);
    const due = task.dueDate ? formatDate(task.dueDate) : null;

    // In-app bell: only employees who have a login, and never the assigner.
    const noteUserIds = employees
      .map((e) => e.user?.id)
      .filter((x): x is string => !!x && x !== assignerUserId);
    if (noteUserIds.length) {
      // Central notify: writes the in-app bell row AND fires a Web Push.
      await notify(noteUserIds, {
        type: "TASK",
        title: "New task assigned",
        body: `${assignerName} assigned you "${task.name}".`,
        meta: { taskId },
      });
    }

    // Email: anyone with an address, except the assigner's own row.
    await Promise.all(
      employees
        .filter((e) => e.email && e.user?.id !== assignerUserId)
        .map((e) =>
          sendTaskAssignedEmail({
            to: e.email,
            name: e.fullName,
            taskName: task.name,
            projectName,
            assignerName,
            dueDate: due,
            link,
          }).catch(() => {
            /* one bad address shouldn't stop the others */
          }),
        ),
    );
  } catch {
    /* never block assignment on a notification failure */
  }
}
