import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/ui/back-link";
import { PageHeader } from "@/components/ui/page-header";
import { KbForm } from "@/components/kb/kb-form";

export const metadata: Metadata = { title: "Edit article · Operix" };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePage();

  const [article, projects, departments, services, projectServices] = await Promise.all([
    prisma.kbArticle.findFirst({
      where: { id, companyId: session.companyId },
      select: { id: true, title: true, body: true, keywords: true, projectId: true, departmentId: true, serviceId: true },
    }),
    prisma.project.findMany({ where: { companyId: session.companyId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId: session.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.service.findMany({ where: { companyId: session.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, departmentId: true } }),
    prisma.projectService.findMany({ where: { project: { companyId: session.companyId } }, select: { projectId: true, serviceId: true } }),
  ]);
  if (!article) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <BackLink href={`/knowledge-base/${id}`}>Back to article</BackLink>
      </div>
      <PageHeader title="Edit article" description="Your change is saved to the change log with your name and time." />
      <KbForm
        projects={projects}
        departments={departments}
        services={services}
        projectServices={projectServices}
        articleId={id}
        initial={{
          title: article.title,
          body: article.body,
          projectId: article.projectId ?? "",
          departmentId: article.departmentId ?? "",
          serviceId: article.serviceId ?? "",
          keywords: article.keywords ?? "",
        }}
      />
    </div>
  );
}
