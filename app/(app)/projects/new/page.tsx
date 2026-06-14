import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectForm } from "@/components/projects/project-form";

export const metadata: Metadata = { title: "New project · Operix" };

export default async function NewProjectPage() {
  const session = await requirePage("project:manage");

  const [clients, services] = await Promise.all([
    prisma.client.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.service.findMany({
      where: { companyId: session.companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href="/projects" className="text-sm text-muted hover:text-content">
          ← Back to projects
        </Link>
      </div>
      <PageHeader title="New project" description="Create a project to track delivery." />
      <ProjectForm clients={clients} services={services} />
    </div>
  );
}
