import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { NewTaskForm } from "@/components/tasks/new-task-form";

export const metadata: Metadata = { title: "New task · Operix" };

export default async function NewTaskPage() {
  const session = await requirePage("task:manage");

  const projects = await prisma.project.findMany({
    where: { companyId: session.companyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      services: { orderBy: { service: { name: "asc" } }, select: { serviceId: true, service: { select: { name: true } } } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href="/tasks" className="text-sm text-muted hover:text-content">
          ← Back to tasks
        </Link>
      </div>
      <PageHeader title="New task" description="Create a task under a project." />
      <NewTaskForm
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          services: p.services.map((s) => ({ id: s.serviceId, name: s.service.name })),
        }))}
      />
    </div>
  );
}
