import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clientRaisedFilter } from "@/lib/tasks/client-tasks";
import { formatNoteTime, type ClientNote } from "@/lib/notifications/categories";

/**
 * Which tasks the portal may show: ones the **client raised themselves**, and
 * not since hidden by their manager.
 *
 * Client-raised is the outer gate, so an internal task can never surface here —
 * not even one carrying a stale `clientVisible` from before internal sharing
 * was removed. That makes this the fix for the existing rows as well as the
 * rule going forward, with no data migration.
 *
 * `clientRaisedFilter` is used rather than a bare `clientRaised: true` because
 * it also matches client tasks that predate the column, where the flag reads
 * false but a client user created the row.
 */
async function portalTasksWhere(companyId: string): Promise<Prisma.TaskWhereInput> {
  return {
    deletedAt: null,
    AND: [
      await clientRaisedFilter(companyId),
      // The manager can still hide one; a task in their review queue always shows.
      { OR: [{ clientVisible: true }, { status: "CLIENT_REVIEW" }] },
    ],
  };
}

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
  const taskWhere = await portalTasksWhere(companyId);
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
        where: taskWhere,
        select: { status: true },
      },
    },
  });
  return projects.map(({ tasks, ...p }) => ({ ...p, progress: progressOf(tasks) }));
}

export async function getClientProject(clientId: string, companyId: string, projectId: string) {
  const taskWhere = await portalTasksWhere(companyId);
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
        // Only the client's own requests — see portalTasksWhere. Progress below
        // is computed from this same set, so the two can't disagree.
        where: taskWhere,
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
      project: { clientId, companyId, deletedAt: null },
      ...(await portalTasksWhere(companyId)),
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
      attachments: {
        where: { inline: false },
        orderBy: { createdAt: "desc" },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
      },
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

/**
 * The client's open requests — raised by them, not finished.
 *
 * CLIENT_REVIEW is left out on purpose: those already have their own section on
 * the dashboard with the approve / request-changes controls attached, and
 * listing the same task twice on one screen only makes it longer.
 *
 * Soonest deadline first, undated last — the same order the internal boards
 * use, so the two don't disagree about what looks urgent.
 */
export async function listOpenClientTasks(clientId: string, companyId: string) {
  return prisma.task.findMany({
    where: {
      ...(await portalTasksWhere(companyId)),
      project: { clientId, companyId, deletedAt: null },
      status: { notIn: ["COMPLETED", "CLIENT_REVIEW"] },
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 25,
    select: {
      id: true,
      name: true,
      status: true,
      dueDate: true,
      project: { select: { id: true, name: true } },
      service: { select: { name: true } },
    },
  });
}

export async function listPendingTaskReviews(clientId: string, companyId: string) {
  return prisma.task.findMany({
    // Client-raised only: CLIENT_REVIEW on an internal task is not the client's
    // business, so it must not appear in their review queue.
    where: {
      status: "CLIENT_REVIEW",
      deletedAt: null,
      project: { clientId, companyId, deletedAt: null },
      ...(await clientRaisedFilter(companyId)),
    },
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
  /** Their own chosen name + photo, once they've filled in their profile. */
  nickname: string | null;
  avatarUrl: string | null;
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
    select: {
      id: true,
      email: true,
      nickname: true,
      avatarUrl: true,
      passwordHash: true,
      lastLoginAt: true,
    },
  });
  const primaryId = users[0]?.id ?? null;
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    accepted: !!u.passwordHash,
    isPrimary: u.id === primaryId,
    lastLoginAt: u.lastLoginAt,
  }));
}

export async function getPortalSummary(clientId: string, companyId: string) {
  const [projectCount, tasksAwaiting, deliverablesAwaiting] = await Promise.all([
    prisma.project.count({ where: { clientId, companyId, deletedAt: null } }),
    prisma.task.count({
      // Must match listPendingTaskReviews, or the badge counts what the list
      // won't show.
      where: {
        status: "CLIENT_REVIEW",
        deletedAt: null,
        project: { clientId, companyId, deletedAt: null },
        ...(await clientRaisedFilter(companyId)),
      },
    }),
    prisma.deliverable.count({
      where: { status: "SUBMITTED", project: { clientId, companyId, deletedAt: null } },
    }),
  ]);
  return { projectCount, tasksAwaiting, deliverablesAwaiting };
}
