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
import { ProjectEdit } from "@/components/projects/project-edit";
import { ProjectServices } from "@/components/projects/project-services";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { DeliverablesPanel } from "@/components/projects/deliverables-panel";
import { BackLink } from "@/components/ui/back-link";
import type { KanbanTask } from "@/lib/projects/actions";

export const metadata: Metadata = { title: "Project · Oprix" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePage("project:manage");

  const [project, allCategories, employees] = await Promise.all([
    prisma.project.findFirst({
      where: { id, companyId: session.companyId, deletedAt: null },
      include: {
        client: { select: { id: true, name: true } },
        services: {
          orderBy: { service: { name: "asc" } },
          select: {
            id: true,
            serviceId: true,
            primaryAssigneeId: true,
            service: {
              select: {
                name: true,
                children: { orderBy: { name: "asc" }, select: { id: true, name: true } },
              },
            },
          },
        },
        tasks: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            status: true,
            priority: true,
            service: { select: { name: true } },
            assignees: { select: { employee: { select: { fullName: true } } } },
          },
        },
        deliverables: {
          orderBy: { submittedAt: "desc" },
          select: { id: true, name: true, description: true, link: true, status: true, feedback: true },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    }),
    // Only top-level categories can be linked to a project.
    prisma.service.findMany({
      where: { companyId: session.companyId, parentId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  if (!project) notFound();

  const usedServiceIds = new Set(project.services.map((ps) => ps.serviceId));
  const available = allCategories.filter((s) => !usedServiceIds.has(s.id));

  const initialTasks: KanbanTask[] = project.tasks.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    priority: t.priority,
    serviceName: t.service?.name ?? null,
    assigneeNames: t.assignees.map((a) => a.employee.fullName),
  }));

  return (
    <div>
      <div className="mb-4">
        <BackLink href="/projects">Back to projects</BackLink>
      </div>

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
            <ProjectEdit
              projectId={project.id}
              initial={{
                name: project.name,
                description: project.description ?? "",
                priority: project.priority,
                type: project.type,
                startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : "",
                dueDate: project.dueDate ? project.dueDate.toISOString().slice(0, 10) : "",
              }}
            />
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

      <div className="grid grid-cols-1 items-start gap-x-5 lg:grid-cols-2">
        <ProjectServices
          projectId={project.id}
          items={project.services.map((ps) => ({
            id: ps.id,
            categoryName: ps.service.name,
            subcategories: ps.service.children,
            primaryAssigneeId: ps.primaryAssigneeId,
          }))}
          available={available}
          employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
        />

        <Card className="mb-6">
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="text-sm font-semibold text-content">Attachments</h3>
          </div>
          <div className="p-5">
            <AttachmentsPanel
              uploadUrl={`/api/projects/${project.id}/attachments`}
              canEdit
              initial={project.attachments.map((a) => ({
                id: a.id,
                fileName: a.fileName,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
                createdAt: a.createdAt.toISOString(),
              }))}
            />
          </div>
        </Card>

        {project.client && <DeliverablesPanel projectId={project.id} items={project.deliverables} />}
      </div>

      <KanbanBoard projectId={project.id} initialTasks={initialTasks} />
    </div>
  );
}
