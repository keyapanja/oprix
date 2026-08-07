import "server-only";
import type { TaskStatus, Priority, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { resolveTaskScope, type TaskScope } from "@/lib/tasks/visibility";

/**
 * Prisma `where` fragment matching client-raised tasks: the `clientRaised` flag
 * is set (new tasks) OR the creator is a client user (covers rows predating the
 * flag — no backfill). Used positively for the Client tasks view, and negatively
 * to keep those tasks out of the normal task board (a fully separate setup).
 */
export async function clientRaisedFilter(companyId: string): Promise<Prisma.TaskWhereInput> {
  const clientUsers = await prisma.user.findMany({
    where: { companyId, role: "CLIENT" },
    select: { id: true },
  });
  const ids = clientUsers.map((u) => u.id);
  return { OR: [{ clientRaised: true }, ...(ids.length ? [{ createdById: { in: ids } }] : [])] };
}

/** Whether one task is client-raised — drives canonical /client-tasks vs /tasks URLs. */
export async function isClientRaisedTask(companyId: string, taskId: string): Promise<boolean> {
  const filter = await clientRaisedFilter(companyId);
  const t = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null, project: { companyId }, ...filter },
    select: { id: true },
  });
  return !!t;
}

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
 * assigned to them. Gated by `task:manage` at the page (like the Tasks board).
 */
export async function listClientTasks(
  session: SessionUser,
): Promise<{ rows: ClientTaskRow[]; scope: TaskScope }> {
  const scope = await resolveTaskScope(session.companyId, session.role);
  const mineOnly = scope !== "ALL";

  const clientFilter = await clientRaisedFilter(session.companyId);

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      project: { companyId: session.companyId, deletedAt: null },
      ...clientFilter,
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
