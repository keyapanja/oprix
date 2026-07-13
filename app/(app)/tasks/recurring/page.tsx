import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { RecurringTasks } from "@/components/tasks/recurring-tasks";
import { parseSchedule, describeSchedule } from "@/lib/forms/schedule";
import { resolveTaskScope } from "@/lib/tasks/visibility";

export const metadata: Metadata = { title: "Recurring tasks · Oprix" };

export default async function RecurringTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requirePage("task:manage");
  const sp = await searchParams;
  const initialView = sp.view === "mine" ? "mine" : sp.view === "created" ? "created" : "all";

  // Visibility: admins (ALL scope) see every recurring template; everyone else
  // sees only the ones they created or are assigned to — same model as the task board.
  const scope = await resolveTaskScope(session.companyId, session.role);
  const canSeeAll = scope === "ALL";

  const [projects, employees, templates] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
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
    prisma.recurringTask.findMany({
      where: { companyId: session.companyId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const empName = new Map(employees.map((e) => [e.id, e.fullName]));
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const subName = new Map<string, string>();
  for (const p of projects) {
    for (const ps of p.services) {
      for (const sub of ps.service.children) subName.set(sub.id, `${ps.service.name} › ${sub.name}`);
    }
  }

  const items = templates
    .map((t) => {
      const schedule = parseSchedule(t.schedule);
      const ids = Array.isArray(t.assigneeIds)
        ? (t.assigneeIds as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const mine = !!session.employeeId && ids.includes(session.employeeId);
      const createdByMe = t.createdById === session.userId;
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        projectName: projName.get(t.projectId) ?? "Unknown project",
        taskType: t.serviceId ? subName.get(t.serviceId) ?? null : null,
        priority: t.priority,
        assigneeNames: ids.map((id) => empName.get(id)).filter((n): n is string => !!n),
        dueInDays: t.dueInDays,
        clientDeadlineInDays: t.clientDeadlineInDays,
        checklistEnabled: t.checklistEnabled,
        checklistCount: Array.isArray(t.checklist)
          ? (t.checklist as unknown[]).filter((x) => typeof x === "string").length
          : null,
        active: t.active,
        scheduleLabel: schedule ? describeSchedule(schedule) : "Invalid schedule",
        lastRunKey: t.lastRunKey,
        mine,
        createdByMe,
      };
    })
    // Non-admins only see recurring tasks they created or are assigned to.
    .filter((it) => canSeeAll || it.mine || it.createdByMe);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <BackLink href="/tasks">Back to tasks</BackLink>
      </div>
      <PageHeader
        title="Recurring tasks"
        description="Set up tasks that get created automatically on a schedule — every Monday, the 15th of each month, and so on."
      />
      <RecurringTasks
        items={items}
        initialView={initialView}
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          subcategories: p.services.flatMap((ps) =>
            ps.service.children.map((sub) => ({
              id: sub.id,
              name: sub.name,
              categoryName: ps.service.name,
              primaryAssigneeId: ps.primaryAssigneeId ?? null,
              checklist: sub.checklistTemplate.map((c) => c.text),
            })),
          ),
        }))}
        employees={employees.map((e) => ({ id: e.id, name: e.fullName }))}
      />
    </div>
  );
}
