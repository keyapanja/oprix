import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { NewTaskForm, type TaskPrefill } from "@/components/tasks/new-task-form";

export const metadata: Metadata = { title: "New task · Oprix" };

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; from?: string }>;
}) {
  const session = await requirePage("task:manage");
  const sp = await searchParams;

  // `?from=` copies an existing task's details into the form — the path from a
  // client request to a real internal task. Nothing is saved until Create.
  const source = sp.from
    ? await prisma.task.findFirst({
        where: { id: sp.from, deletedAt: null, project: { companyId: session.companyId } },
        select: {
          id: true,
          name: true,
          description: true,
          projectId: true,
          priority: true,
          dueDate: true,
          clientDeadline: true,
          clientRaised: true,
          assignees: { select: { employeeId: true } },
        },
      })
    : null;

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

  // The task type has no equivalent on a client request, so it's deliberately
  // left blank for whoever files the internal task to choose.
  const prefill: TaskPrefill | undefined = source
    ? {
        projectId: source.projectId,
        name: source.name,
        description: source.description ?? "",
        priority: source.priority,
        dueDate: source.dueDate ? source.dueDate.toISOString().slice(0, 10) : "",
        clientDeadline: source.clientDeadline ? source.clientDeadline.toISOString().slice(0, 10) : "",
        assigneeIds: source.assignees.map((a) => a.employeeId),
        source: {
          href: source.clientRaised ? `/client-tasks/${source.id}` : `/tasks/${source.id}`,
          label: source.name,
          fromClient: source.clientRaised,
        },
      }
    : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <BackLink href="/tasks">Back to tasks</BackLink>
      </div>
      <PageHeader
        title="New task"
        description={
          prefill ? "Check the details, pick a task type, then create." : "Create a task under a project."
        }
      />
      <NewTaskForm
        prefill={prefill}
        initialProjectId={initialProjectId}
        // Only a project-page arrival fixes the project; a copied task can be
        // re-pointed if the internal work belongs somewhere else.
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
