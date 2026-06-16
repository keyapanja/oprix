import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { NewTaskForm } from "@/components/tasks/new-task-form";

export const metadata: Metadata = { title: "New task · Operix" };

export default async function NewTaskPage() {
  const session = await requirePage("task:manage");

  const [projects, departments, employees] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        // A project links categories; tasks pick one of their sub-categories.
        services: {
          where: { service: { parentId: null } },
          orderBy: { service: { name: "asc" } },
          select: {
            service: {
              select: {
                name: true,
                children: {
                  orderBy: { name: "asc" },
                  select: {
                    id: true,
                    name: true,
                    departmentId: true,
                    checklistTemplate: { orderBy: { orderIndex: "asc" }, select: { text: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.department.findMany({
      where: { companyId: session.companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, departmentId: true },
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
          subcategories: p.services.flatMap((ps) =>
            ps.service.children.map((sub) => ({
              id: sub.id,
              name: sub.name,
              categoryName: ps.service.name,
              departmentId: sub.departmentId,
              checklist: sub.checklistTemplate.map((c) => c.text),
            })),
          ),
        }))}
        departments={departments}
        employees={employees.map((e) => ({ id: e.id, name: e.fullName, departmentId: e.departmentId }))}
      />
    </div>
  );
}
