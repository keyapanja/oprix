import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { NewTaskForm } from "@/components/tasks/new-task-form";

export const metadata: Metadata = { title: "New task · Oprix" };

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await requirePage("task:manage");
  const sp = await searchParams;

  const [projects, employees, overrides, configs] = await Promise.all([
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
            primaryAssigneeId: true,
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
    prisma.employee.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    // Per-(project, task type) checklist overrides across the company's projects.
    prisma.projectSubcategoryChecklistItem.findMany({
      where: { project: { companyId: session.companyId, deletedAt: null } },
      orderBy: { orderIndex: "asc" },
      select: { projectId: true, serviceId: true, text: true },
    }),
    // …and the mode (extend / replace) for the pairs that are customised.
    prisma.projectSubcategoryChecklist.findMany({
      where: { project: { companyId: session.companyId, deletedAt: null } },
      select: { projectId: true, serviceId: true, mode: true },
    }),
  ]);

  // Map "<projectId>:<subcategoryId>" → override checklist texts + mode.
  const overrideMap = new Map<string, string[]>();
  for (const o of overrides) {
    const k = `${o.projectId}:${o.serviceId}`;
    (overrideMap.get(k) ?? overrideMap.set(k, []).get(k)!).push(o.text);
  }
  const modeMap = new Map<string, "EXTEND" | "REPLACE">();
  for (const c of configs) modeMap.set(`${c.projectId}:${c.serviceId}`, c.mode);
  // Resolve a pair's pre-filled checklist: default / extend / replace.
  const resolveChecklist = (pair: string, def: string[]): string[] => {
    const m = modeMap.get(pair);
    if (!m) return def;
    const custom = overrideMap.get(pair) ?? [];
    return m === "EXTEND" ? [...def, ...custom] : custom;
  };

  // Pre-select the project when arriving from a project page (?project=…).
  const initialProjectId = projects.some((p) => p.id === sp.project) ? sp.project! : "";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <BackLink href="/tasks">Back to tasks</BackLink>
      </div>
      <PageHeader title="New task" description="Create a task under a project." />
      <NewTaskForm
        initialProjectId={initialProjectId}
        lockProject={Boolean(initialProjectId)}
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          subcategories: p.services.flatMap((ps) =>
            ps.service.children.map((sub) => ({
              id: sub.id,
              name: sub.name,
              categoryName: ps.service.name,
              primaryAssigneeId: ps.primaryAssigneeId ?? null,
              checklist: resolveChecklist(`${p.id}:${sub.id}`, sub.checklistTemplate.map((c) => c.text)),
            })),
          ),
        }))}
        employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
      />
    </div>
  );
}
