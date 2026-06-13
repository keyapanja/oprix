import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum, formatDate } from "@/lib/format";
import { PRIORITY_TONE } from "@/lib/status";
import { KanbanBoard } from "@/components/projects/kanban-board";
import { ProjectStatusControl } from "@/components/projects/project-status";
import type { KanbanTask } from "@/lib/projects/actions";

export const metadata: Metadata = { title: "Project · Operix" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage("project:manage");

  const [project, employees] = await Promise.all([
    prisma.project.findFirst({
      where: { id, companyId: session.companyId, deletedAt: null },
      include: {
        client: { select: { id: true, name: true } },
        tasks: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            status: true,
            priority: true,
            assignee: { select: { fullName: true } },
          },
        },
      },
    }),
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  if (!project) notFound();

  const initialTasks: KanbanTask[] = project.tasks.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    priority: t.priority,
    assigneeName: t.assignee?.fullName ?? null,
  }));

  return (
    <div>
      <div className="mb-4">
        <Link href="/projects" className="text-sm text-muted hover:text-content">
          ← Back to projects
        </Link>
      </div>

      {/* Header */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-content">{project.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {project.client ? (
                <Link href={`/clients/${project.client.id}`} className="hover:text-accent">
                  {project.client.name}
                </Link>
              ) : (
                "No client"
              )}
            </p>
            {project.description && (
              <p className="mt-3 max-w-2xl text-sm text-muted">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={PRIORITY_TONE[project.priority]}>{humanizeEnum(project.priority)}</Badge>
            <ProjectStatusControl id={project.id} status={project.status} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 text-sm">
          <div>
            <span className="text-faint">Start</span>{" "}
            <span className="font-medium text-content">{formatDate(project.startDate)}</span>
          </div>
          <div>
            <span className="text-faint">Due</span>{" "}
            <span className="font-medium text-content">{formatDate(project.dueDate)}</span>
          </div>
        </div>
      </Card>

      <KanbanBoard
        projectId={project.id}
        employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
        initialTasks={initialTasks}
      />
    </div>
  );
}
