import "server-only";
import { prisma } from "@/lib/db";
import { formatNoteTime, type ClientNote } from "@/lib/notifications/categories";

/** Where a client notification points inside the portal (never internal routes). */
function portalNoteHref(type: string, meta: unknown): string | null {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  if (typeof m.taskId === "string") return `/portal/tasks/${m.taskId}`;
  if (type.includes("DELIVERABLE")) return "/portal/deliverables";
  if (typeof m.projectId === "string") return `/portal/projects/${m.projectId}`;
  return null;
}

/** The signed-in client's notifications + unread count for the portal bell/page. */
export async function getPortalNotifications(
  userId: string,
): Promise<{ items: ClientNote[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, title: true, body: true, type: true, meta: true, isRead: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return {
    unread,
    items: rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      href: portalNoteHref(n.type, n.meta),
      time: formatNoteTime(n.createdAt),
      isRead: n.isRead,
    })),
  };
}

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
      type: true,
      dueDate: true,
      // Progress reflects the client-facing tasks only (matches the detail page).
      tasks: {
        where: { deletedAt: null, OR: [{ clientVisible: true }, { status: "CLIENT_REVIEW" }] },
        select: { status: true },
      },
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
      type: true,
      dueDate: true,
      tasks: {
        // Only tasks meant for the client: those explicitly shared with them, or
        // sitting in their review queue. Internal-only tasks never reach the
        // portal — and progress below is computed from this same client-facing set.
        where: { deletedAt: null, OR: [{ clientVisible: true }, { status: "CLIENT_REVIEW" }] },
        orderBy: { createdAt: "asc" },
        // No timers / cost — progress only, plus client-visible flag + due date
        // for the tasks the client and their manager exchange.
        select: {
          id: true,
          name: true,
          status: true,
          finalLink: true,
          clientVisible: true,
          dueDate: true,
          createdById: true,
          service: { select: { name: true } },
        },
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

/** One client-facing task, for the portal task detail page. Ownership + the
 *  client-facing gate live in the WHERE, so a foreign/internal id returns null. */
export async function getClientTask(clientId: string, companyId: string, taskId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      project: { clientId, companyId, deletedAt: null },
      OR: [{ clientVisible: true }, { status: "CLIENT_REVIEW" }],
    },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      finalLink: true,
      dueDate: true,
      createdById: true,
      clientRaised: true, // the client raised it → they can edit/withdraw it
      service: { select: { name: true } },
      project: { select: { id: true, name: true } },
    },
  });
}

/** Change history for a task the client owns. Ownership is verified separately
 *  via getClientTask (a foreign id there returns null before this is called). */
export async function getClientTaskActivity(companyId: string, taskId: string) {
  return prisma.activityLog.findMany({
    where: { companyId, entityType: "TASK", entityId: taskId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, meta: true, createdAt: true },
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
    where: { status: "CLIENT_REVIEW", deletedAt: null, project: { clientId, companyId, deletedAt: null } },
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

export type TeamMember = {
  id: string;
  email: string;
  accepted: boolean; // has set a password (vs. a pending invite)
  isPrimary: boolean; // the earliest login — can manage the team
  lastLoginAt: Date | null;
};

/**
 * The client's portal team — every active CLIENT login for this client. The
 * earliest-created one is the "primary contact" who (with internal admins) can
 * invite/remove members.
 */
export async function listClientTeam(clientId: string, companyId: string): Promise<TeamMember[]> {
  const users = await prisma.user.findMany({
    where: { clientId, companyId, role: "CLIENT", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, passwordHash: true, lastLoginAt: true },
  });
  const primaryId = users[0]?.id ?? null;
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    accepted: !!u.passwordHash,
    isPrimary: u.id === primaryId,
    lastLoginAt: u.lastLoginAt,
  }));
}

export async function getPortalSummary(clientId: string, companyId: string) {
  const [projectCount, tasksAwaiting, deliverablesAwaiting] = await Promise.all([
    prisma.project.count({ where: { clientId, companyId, deletedAt: null } }),
    prisma.task.count({
      where: { status: "CLIENT_REVIEW", deletedAt: null, project: { clientId, companyId, deletedAt: null } },
    }),
    prisma.deliverable.count({
      where: { status: "SUBMITTED", project: { clientId, companyId, deletedAt: null } },
    }),
  ]);
  return { projectCount, tasksAwaiting, deliverablesAwaiting };
}
