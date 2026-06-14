import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { TasksTable, type TaskRow } from "@/components/tasks/tasks-table";

export const metadata: Metadata = { title: "Tasks · Operix" };

export default async function TasksPage() {
  const session = await requirePage("task:manage");

  const tasks = await prisma.task.findMany({
    where: { project: { companyId: session.companyId, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      dueDate: true,
      project: { select: { name: true } },
      service: { select: { name: true } },
      assignees: { select: { employee: { select: { fullName: true } } } },
    },
  });

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    projectName: t.project.name,
    serviceName: t.service?.name ?? null,
    status: t.status,
    priority: t.priority,
    assigneeNames: t.assignees.map((a) => a.employee.fullName),
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
  }));

  return (
    <>
      <PageHeader
        title="Tasks"
        description={`${rows.length} ${rows.length === 1 ? "task" : "tasks"} across your projects.`}
        action={
          <Link href="/tasks/new">
            <Button>
              <Icon name="plus" className="size-4" />
              New task
            </Button>
          </Link>
        }
      />
      <TasksTable rows={rows} />
    </>
  );
}
