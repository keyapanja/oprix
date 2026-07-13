import "server-only";
import { prisma } from "@/lib/db";

export type ProjectManager = { employeeId: string; name: string; userId: string | null };

/**
 * A project's Business Manager — the client's single point of contact in the
 * portal. It's the primary assignee of the project's **client-facing category**
 * (a linked category service whose department is marked `clientFacing`). Client
 * task-requests are auto-assigned to this person. Returns null if the project
 * has no client-facing category with a primary assignee yet.
 */
export async function getProjectManager(projectId: string): Promise<ProjectManager | null> {
  const ps = await prisma.projectService.findFirst({
    where: {
      projectId,
      primaryAssigneeId: { not: null },
      service: { parentId: null, department: { clientFacing: true } },
    },
    orderBy: { id: "asc" }, // deterministic when several client-facing categories exist
    select: {
      primaryAssignee: {
        select: { id: true, fullName: true, deletedAt: true, user: { select: { id: true } } },
      },
    },
  });
  const pa = ps?.primaryAssignee;
  if (!pa || pa.deletedAt) return null;
  return { employeeId: pa.id, name: pa.fullName, userId: pa.user?.id ?? null };
}
