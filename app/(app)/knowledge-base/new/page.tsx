import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/ui/back-link";
import { PageHeader } from "@/components/ui/page-header";
import { KbForm } from "@/components/kb/kb-form";

export const metadata: Metadata = { title: "New article · Operix" };

export default async function NewArticlePage() {
  const session = await requirePage();

  const [projects, departments, services, projectServices] = await Promise.all([
    prisma.project.findMany({ where: { companyId: session.companyId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId: session.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Sub-categories only — articles attach at the sub-category level (tasks carry a sub-category).
    prisma.service.findMany({ where: { companyId: session.companyId, parentId: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, departmentId: true, parentId: true } }),
    prisma.projectService.findMany({ where: { project: { companyId: session.companyId } }, select: { projectId: true, serviceId: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <BackLink href="/knowledge-base">Back to Knowledge Base</BackLink>
      </div>
      <PageHeader title="New article" description="Write a guide. Everyone can edit it later, and every change is logged." />
      <KbForm projects={projects} departments={departments} services={services} projectServices={projectServices} />
    </div>
  );
}
