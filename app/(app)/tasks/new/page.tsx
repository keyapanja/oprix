import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { NewTaskForm } from "@/components/tasks/new-task-form";

export const metadata: Metadata = { title: "New task · Operix" };

export default async function NewTaskPage() {
  const session = await requirePage("task:manage");

  const [projects, employees] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        services: {
          orderBy: { service: { name: "asc" } },
          select: {
            serviceId: true,
            primaryAssigneeId: true,
            service: {
              select: {
                name: true,
                checklistTemplate: { orderBy: { orderIndex: "asc" }, select: { text: true } },
              },
            },
            checklist: { orderBy: { orderIndex: "asc" }, select: { text: true } },
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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <BackLink href="/tasks">Back to tasks</BackLink>
      </div>
      <PageHeader title="New task" description="Create a task under a project." />
      <NewTaskForm
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          services: p.services.map((s) => ({
            id: s.serviceId,
            name: s.service.name,
            primaryAssigneeId: s.primaryAssigneeId,
            // Project-specific checklist if present, else the service default template.
            checklist: (s.checklist.length ? s.checklist : s.service.checklistTemplate).map((c) => c.text),
          })),
        }))}
        employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
      />
    </div>
  );
}
