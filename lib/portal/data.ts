import "server-only";
import { prisma } from "@/lib/db";

// Every read here is scoped to one client (clientId + companyId). This is the
// single place portal data is fetched, so the isolation boundary lives in one
// file. Selections are deliberately minimal — progress only, never assignees,
// time, or cost.

export type Progress = { total: number; completed: number; pct: number; awaitingReview: number };

export function progressOf(tasks: { status: string }[]): Progress {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const awaitingReview = tasks.filter((t) => t.status === "CLIENT_REVIEW").length;
  return { total, completed, pct: total ? Math.round((completed / total) * 100) : 0, awaitingReview };
}

export async function listClientProjects(clientId: string, companyId: string) {
  const projects = await prisma.project.findMany({
    where: { clientId, companyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      startDate: true,
      dueDate: true,
      tasks: { select: { status: true } },
    },
  });
  return projects.map(({ tasks, ...p }) => ({ ...p, progress: progressOf(tasks) }));
}

export async function getClientProject(clientId: string, companyId: string, projectId: string) {
  return prisma.project.findFirst({
    // Ownership is part of the WHERE — a wrong id simply returns null (→ 404).
    where: { id: projectId, clientId, companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      startDate: true,
      dueDate: true,
      tasks: {
        orderBy: { createdAt: "asc" },
        // No assignees / timers / cost — progress only.
        select: { id: true, name: true, status: true, finalLink: true, service: { select: { name: true } } },
      },
      deliverables: {
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          link: true,
          status: true,
          feedback: true,
          submittedAt: true,
          decidedAt: true,
        },
      },
    },
  });
}

export async function listClientDeliverables(clientId: string, companyId: string) {
  return prisma.deliverable.findMany({
    where: { project: { clientId, companyId, deletedAt: null } },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      link: true,
      status: true,
      feedback: true,
      submittedAt: true,
      decidedAt: true,
      project: { select: { id: true, name: true } },
    },
  });
}

export async function listPendingTaskReviews(clientId: string, companyId: string) {
  return prisma.task.findMany({
    where: { status: "CLIENT_REVIEW", project: { clientId, companyId, deletedAt: null } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      finalLink: true,
      service: { select: { name: true } },
      project: { select: { id: true, name: true } },
    },
  });
}

export async function getPortalSummary(clientId: string, companyId: string) {
  const [projectCount, tasksAwaiting, deliverablesAwaiting] = await Promise.all([
    prisma.project.count({ where: { clientId, companyId, deletedAt: null } }),
    prisma.task.count({
      where: { status: "CLIENT_REVIEW", project: { clientId, companyId, deletedAt: null } },
    }),
    prisma.deliverable.count({
      where: { status: "SUBMITTED", project: { clientId, companyId, deletedAt: null } },
    }),
  ]);
  return { projectCount, tasksAwaiting, deliverablesAwaiting };
}
