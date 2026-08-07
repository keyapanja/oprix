import "server-only";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";

/**
 * Notify a project's client — every active portal login under that client —
 * about something they need to see (a task ready for review, a new deliverable).
 * In-app bell + Web Push only; email is skipped because the central email links
 * point at internal routes, and clients live under /portal. No-op when the
 * project has no client or the client has no active logins yet.
 */
export async function notifyProjectClient(
  projectId: string,
  input: { type: string; title: string; body: string; meta?: Record<string, string> },
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, companyId: true },
  });
  if (!project?.clientId) return;

  const users = await prisma.user.findMany({
    where: { clientId: project.clientId, companyId: project.companyId, role: "CLIENT", isActive: true },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;

  await notify(ids, { ...input, email: false });
}
