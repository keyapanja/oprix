import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { vaultProject } from "@/lib/vault/access";
import { BackLink } from "@/components/ui/back-link";
import { CredentialsSection } from "@/components/vault/credentials-section";

export const metadata: Metadata = { title: "Credentials · Oprix" };

export default async function ProjectCredentialsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const session = await requirePage();
  // Only people on this project's list get the page; managers who aren't on it
  // manage access from the project page instead.
  const project = await vaultProject(session, projectId);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <BackLink href="/credentials">All credentials</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight text-content">{project.name}</h1>
      <CredentialsSection session={session} projectId={project.id} />
    </div>
  );
}
