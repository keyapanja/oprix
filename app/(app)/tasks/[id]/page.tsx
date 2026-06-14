import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum, formatDate } from "@/lib/format";
import { PRIORITY_TONE } from "@/lib/status";
import { TaskStatusControl } from "@/components/tasks/task-status";
import { TaskAssignees } from "@/components/tasks/task-assignees";
import { TaskChecklist } from "@/components/tasks/task-checklist";
import { TaskEdit } from "@/components/tasks/task-edit";
import { CommentForm } from "@/components/tasks/comment-form";

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
  if (!isManager && !isAssignee) notFound();

  const [employees, activity] = await Promise.all([
    isManager
      ? prisma.employee.findMany({
          where: { companyId: session.companyId, deletedAt: null },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([] as { id: string; fullName: string }[]),
    prisma.activityLog.findMany({
      where: { companyId: session.companyId, entityType: "TASK", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, meta: true, createdAt: true },
    }),
  ]);

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
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <Link href={`/projects/${task.project.id}`} className="text-sm text-muted hover:text-content">
          ← {task.project.name}
        </Link>
      </div>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-content">{task.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={PRIORITY_TONE[task.priority]}>{humanizeEnum(task.priority)}</Badge>
              {task.service && (
                <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                  {task.service.name}
                </span>
              )}
            </div>
          </div>
          {isManager && (
            <div className="flex flex-col items-end gap-2">
              <TaskStatusControl id={task.id} status={task.status} />
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
            </div>
          )}
        </div>

        {task.description && (
          <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-sm text-muted">{task.description}</p>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Assignees</p>
          <TaskAssignees
            taskId={task.id}
            canEdit={isManager}
            initial={task.assignees.map((a) => ({ id: a.employee.id, name: a.employee.fullName }))}
            employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 border-t border-line pt-4 text-sm">
          <div><span className="text-faint">Started</span> <span className="font-medium text-content">{task.startedAt ? fmtDateTime(task.startedAt) : "—"}</span></div>
          <div><span className="text-faint">Completed</span> <span className="font-medium text-content">{task.completedAt ? fmtDateTime(task.completedAt) : "—"}</span></div>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold text-content">Checklist</h3>
        </div>
        <div className="p-5">
          <TaskChecklist taskId={task.id} canEdit={isManager || isAssignee} initial={task.checklist} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Comments */}
        <Card>
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="text-sm font-semibold text-content">Comments</h3>
          </div>
          <div className="space-y-4 p-5">
            {task.comments.length === 0 ? (
              <p className="text-sm text-muted">No comments yet.</p>
            ) : (
              <ul className="space-y-4">
                {task.comments.map((c) => (
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
            <div className="border-t border-line pt-4">
              <CommentForm taskId={task.id} />
            </div>
          </div>
        </Card>

        {/* History */}
        <Card>
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="text-sm font-semibold text-content">History</h3>
          </div>
          <div className="p-5">
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
  );
}
