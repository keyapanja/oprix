import "server-only";
import type { TaskStatus, Priority } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { resolveTaskScope, type TaskScope } from "@/lib/tasks/visibility";

export type ClientTaskRow = {
  id: string;
  taskNumber: number | null;
  name: string;
  projectName: string;
  clientName: string | null;
  assigneeNames: string[];
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  raisedAt: string; // YYYY-MM-DD
};

/**
 * Tasks a client raised from the portal (`Task.clientRaised`). A viewer with the
 * ALL task scope (admins) sees every one; everyone else sees only the tasks
 * assigned to them. Gated by the `clienttask:view` capability at the page.
 */
export async function listClientTasks(
  session: SessionUser,
): Promise<{ rows: ClientTaskRow[]; scope: TaskScope }> {
  const scope = await resolveTaskScope(session.companyId, session.role);
  const mineOnly = scope !== "ALL";

  // A task is "client-raised" if the flag is set (new tasks) OR its creator is a
  // client user (covers tasks created before the flag existed — no backfill).
  const clientUsers = await prisma.user.findMany({
    where: { companyId: session.companyId, role: "CLIENT" },
    select: { id: true },
  });
  const clientUserIds = clientUsers.map((u) => u.id);

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      project: { companyId: session.companyId, deletedAt: null },
      OR: [{ clientRaised: true }, ...(clientUserIds.length ? [{ createdById: { in: clientUserIds } }] : [])],
      // Non-admins: only tasks assigned to them. (No employee record ⇒ nothing.)
      ...(mineOnly ? { assignees: { some: { employeeId: session.employeeId ?? "__none__" } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      taskNumber: true,
      name: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      assignees: { select: { employee: { select: { fullName: true } } } },
    },
  });

  return {
    scope,
    rows: tasks.map((t) => ({
      id: t.id,
      taskNumber: t.taskNumber,
      name: t.name,
      projectName: t.project.name,
      clientName: t.project.client?.name ?? null,
      assigneeNames: t.assignees.map((a) => a.employee.fullName),
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      raisedAt: t.createdAt.toISOString().slice(0, 10),
    })),
  };
}
