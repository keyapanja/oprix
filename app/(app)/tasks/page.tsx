import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { type TaskRow } from "@/components/tasks/tasks-table";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { LiveRefresh } from "@/components/timer/live-refresh";
import { getTaskTimerStates } from "@/lib/timer/data";
import { canUseTimer } from "@/lib/timer/finalize";
import type { TaskTimerState } from "@/lib/timer/shared";
import { resolveTaskScope, taskScopeWhere, TASK_SCOPE_LABELS } from "@/lib/tasks/visibility";

export const metadata: Metadata = { title: "Tasks · Operix" };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requirePage("task:manage");
  const sp = await searchParams;
  const initialView = sp.view === "mine" ? "mine" : sp.view === "created" ? "created" : "all";

  // Enforce the role's task-visibility scope at the query level.
  const scope = await resolveTaskScope(session.companyId, session.role);
  let departmentId: string | null = null;
  if (scope === "TEAM" && session.employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: session.employeeId },
      select: { departmentId: true },
    });
    departmentId = emp?.departmentId ?? null;
  }
  const scopeWhere = taskScopeWhere(scope, session, departmentId);

  const tasks = await prisma.task.findMany({
    where: { AND: [{ project: { companyId: session.companyId, deletedAt: null } }, scopeWhere] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      createdById: true,
      project: { select: { name: true } },
      service: { select: { name: true, department: { select: { name: true } } } },
      assignees: { select: { employeeId: true, employee: { select: { fullName: true } } } },
    },
  });

  const timerStates: Map<string, TaskTimerState> = await getTaskTimerStates(
    session.userId,
    tasks.map((t) => t.id),
  );

  const rows: TaskRow[] = tasks.map((t) => {
    const isAssignee = !!session.employeeId && t.assignees.some((a) => a.employeeId === session.employeeId);
    const isReviewer = session.userId === t.createdById;
    const canTime = canUseTimer(t.status, isAssignee, isReviewer);
    const state = timerStates.get(t.id) ?? { status: "NONE" as const, baseSeconds: 0, runStartedAtMs: null };
    return {
      id: t.id,
      name: t.name,
      projectName: t.project.name,
      serviceName: t.service?.name ?? null,
      departmentName: t.service?.department?.name ?? null,
      status: t.status,
      priority: t.priority,
      assigneeNames: t.assignees.map((a) => a.employee.fullName),
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      assignedDate: t.createdAt.toISOString().slice(0, 10),
      mine: isAssignee,
      createdByMe: isReviewer,
      timer: { ...state, locked: !canTime },
    };
  });

  // Advanced (department / service) filters are only meaningful beyond own tasks.
  const showAdvancedFilters = scope !== "OWN";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <LiveRefresh seconds={10} />
      <PageHeader
        title="Tasks"
        description={`${rows.length} ${rows.length === 1 ? "task" : "tasks"} · showing ${TASK_SCOPE_LABELS[scope].label.toLowerCase()}.`}
        action={
          <Link href="/tasks/new">
            <Button>
              <Icon name="plus" className="size-4" />
              New task
            </Button>
          </Link>
        }
      />
      <TasksWorkspace rows={rows} canTrack initialView={initialView} showAdvancedFilters={showAdvancedFilters} today={today} />
    </>
  );
}
