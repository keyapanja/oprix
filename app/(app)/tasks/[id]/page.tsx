import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum, formatDate } from "@/lib/format";
import { PRIORITY_TONE, TASK_STATUS_TONE, TASK_STATUS_LABEL } from "@/lib/status";
import { TaskAssignees } from "@/components/tasks/task-assignees";
import { TaskChecklist } from "@/components/tasks/task-checklist";
import { TaskEdit } from "@/components/tasks/task-edit";
import { TaskWorkflow } from "@/components/tasks/task-workflow";
import { CommentForm } from "@/components/tasks/comment-form";
import { TaskTimerControl } from "@/components/timer/task-timer-control";
import { getMyTaskTimer, taskTrackedSeconds } from "@/lib/timer/data";
import { canUseTimer } from "@/lib/timer/finalize";
import { fmtHm } from "@/lib/timer/shared";

export const metadata: Metadata = { title: "Task · Operix" };

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage();

  const task = await prisma.task.findFirst({
    where: { id, project: { companyId: session.companyId } },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      serviceId: true,
      createdById: true,
      finalLink: true,
      dueDate: true,
      startedAt: true,
      completedAt: true,
      project: {
        select: {
          id: true,
          name: true,
          services: { select: { serviceId: true, service: { select: { name: true } } } },
        },
      },
      service: { select: { name: true } },
      assignees: { select: { employee: { select: { id: true, fullName: true } } } },
      checklist: { orderBy: { orderIndex: "asc" }, select: { id: true, text: true, isDone: true } },
      comments: { orderBy: { createdAt: "asc" }, select: { id: true, authorId: true, body: true, createdAt: true } },
    },
  });
  if (!task) notFound();

  const isManager = await hasPermission(session.companyId, session.role, "task:manage");
  const isAssignee = !!session.employeeId && task.assignees.some((a) => a.employee.id === session.employeeId);
  const isReviewer = session.userId === task.createdById;
  if (!isManager && !isAssignee && !isReviewer) notFound();

  // Review-flow roles. Base employees hold task:manage, so submit/review overrides
  // use an elevated capability (project:manage), not isManager.
  const isElevated = await hasPermission(session.companyId, session.role, "project:manage");
  const canSubmit = isAssignee || isElevated; // worker side
  const canReview = isReviewer || isElevated; // creator side
  const canTime = canUseTimer(task.status, isAssignee, isReviewer);
  const lockedReason =
    task.status === "COMPLETED"
      ? "Task completed"
      : task.status === "REVIEW" || task.status === "CLIENT_REVIEW"
        ? "Locked — in review"
        : "Not your task";

  const [employees, activity] = await Promise.all([
    // Everyone in the workspace — for the assignee picker and @-mentions.
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    prisma.activityLog.findMany({
      where: { companyId: session.companyId, entityType: "TASK", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, action: true, meta: true, createdAt: true },
    }),
  ]);

  const myTimer = await getMyTaskTimer(session.userId, id);
  const trackedSeconds = await taskTrackedSeconds(id);

  // Resolve comment authors.
  const authorIds = [...new Set(task.comments.map((c) => c.authorId))];
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, email: true, employee: { select: { fullName: true } } },
      })
    : [];
  const authorName = (uid: string) => {
    const u = authors.find((a) => a.id === uid);
    return u?.employee?.fullName ?? u?.email ?? "Someone";
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3">
        <BackLink href={`/projects/${task.project.id}`}>{task.project.name}</BackLink>
      </div>

      {/* Compact header */}
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-content">{task.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={PRIORITY_TONE[task.priority]}>{humanizeEnum(task.priority)}</Badge>
              {task.service && (
                <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                  {task.service.name}
                </span>
              )}
              {task.dueDate && (
                <span className="text-xs text-faint">Due {formatDate(task.dueDate)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
            {isManager && (
              <TaskEdit
                taskId={task.id}
                projectId={task.project.id}
                services={task.project.services.map((s) => ({ id: s.serviceId, name: s.service.name }))}
                initial={{
                  name: task.name,
                  description: task.description ?? "",
                  serviceId: task.serviceId ?? "",
                  priority: task.priority,
                  dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "",
                }}
              />
            )}
          </div>
        </div>
        {task.description && (
          <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm text-muted">{task.description}</p>
        )}
      </Card>

      {/* Review workflow — submit / review / approve */}
      <Card className="mb-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-content">Workflow</h3>
        <TaskWorkflow
          taskId={task.id}
          status={task.status}
          finalLink={task.finalLink}
          canSubmit={canSubmit}
          canReview={canReview}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-content">Checklist</h3>
            </div>
            <div className="p-5">
              <TaskChecklist taskId={task.id} canEdit={isManager || isAssignee} initial={task.checklist} />
            </div>
          </Card>

          <Card>
            <div className="border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-content">Comments</h3>
            </div>
            <div className="space-y-4 p-5">
              <CommentForm taskId={task.id} people={employees.map((e) => ({ id: e.id, name: e.fullName }))} />
              {task.comments.length === 0 ? (
                <p className="text-sm text-muted">No comments yet.</p>
              ) : (
                <ul className="space-y-4 border-t border-line pt-4">
                  {[...task.comments].reverse().map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <span className="gradient-brand mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
                        {authorName(c.authorId).slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm">
                          <span className="font-medium text-content">{authorName(c.authorId)}</span>{" "}
                          <span className="text-xs text-faint">{fmtDateTime(c.createdAt)}</span>
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{c.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-content">Details</h3>

            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Assignees</p>
            <TaskAssignees
              taskId={task.id}
              canEdit={isManager}
              initial={task.assignees.map((a) => ({ id: a.employee.id, name: a.employee.fullName }))}
              employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
            />

            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-faint">Time tracking</p>
                <span className="text-xs">
                  <span className="text-faint">Total</span>{" "}
                  <span className="font-semibold text-content">{fmtHm(trackedSeconds)}</span>
                </span>
              </div>
              <TaskTimerControl
                taskId={task.id}
                status={myTimer.status}
                baseSeconds={myTimer.baseSeconds}
                runStartedAtMs={myTimer.runStartedAtMs}
                locked={!canTime}
                lockedReason={lockedReason}
              />
            </div>

            <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-faint">Started</span>
                <span className="font-medium text-content">{task.startedAt ? fmtDateTime(task.startedAt) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-faint">Completed</span>
                <span className="font-medium text-content">{task.completedAt ? fmtDateTime(task.completedAt) : "—"}</span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-content">History</h3>
            </div>
            <div className="max-h-[28rem] overflow-y-auto p-5">
              {activity.length === 0 ? (
                <p className="text-sm text-muted">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((a) => {
                    const actor = (a.meta as { actor?: string } | null)?.actor ?? "Someone";
                    return (
                      <li key={a.id} className="flex gap-3 text-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                        <div>
                          <p className="text-content">
                            <span className="font-medium">{actor}</span> {a.action}
                          </p>
                          <p className="text-xs text-faint">{fmtDateTime(a.createdAt)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
