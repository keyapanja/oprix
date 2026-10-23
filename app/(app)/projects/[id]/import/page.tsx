import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/ui/back-link";
import { AirtableImport } from "@/components/projects/airtable-import";

export const metadata: Metadata = { title: "Import tasks · Oprix" };

export default async function ProjectImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePage("org:manage");
  const project = await prisma.project.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink href={`/projects/${project.id}`}>Back to {project.name}</BackLink>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-content">Import tasks from Airtable</h1>
        <p className="mt-1 text-sm text-muted">
          Into <span className="font-medium text-content">{project.name}</span>
          {project.client ? ` · ${project.client.name}` : ""}. They arrive as the client&apos;s own requests,
          assigned to the project&apos;s Business Manager.
        </p>
      </div>
      <AirtableImport projectId={project.id} />
    </div>
  );
}
