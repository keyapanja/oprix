import "server-only";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { canUseTimer } from "@/lib/timer/finalize";
import { getTaskTimerStates } from "@/lib/timer/data";
import { appBaseUrl } from "@/lib/ext/url";
import type { ExtActiveResponse, ExtKbLink, ExtTask } from "@/shared/ext-contract";

// ---------------------------------------------------------------------------
// The dock's feed = the logged-in user's OWN actionable tasks: assigned to them
// (TaskAssignee) and in a WORK state (To Do / In Progress / Redo). Submitting a
// task for review moves it to REVIEW, so it leaves this set and disappears from
// the dock. Everything else lives in the Oprix web app. Each task carries its
// timer state, checklist, and related KB guides. The live timer ticks
// client-side from `timer.runStartedAtMs`, so this is only fetched on a poll.
// ---------------------------------------------------------------------------

const WORK_STATES = ["TODO", "IN_PROGRESS", "REDO"] as const;

export async function getActiveTasksFor(session: SessionUser): Promise<ExtActiveResponse> {
  // Tasks are assigned to employees; a user with no employee record has none.
  if (!session.employeeId) return { tasks: [], serverTimeMs: Date.now() };

  const rows = await prisma.task.findMany({
    where: {
      deletedAt: null,
      project: { companyId: session.companyId, deletedAt: null },
      status: { in: [...WORK_STATES] },
      assignees: { some: { employeeId: session.employeeId } },
    },
    // Stable order (creation time). Deliberately NOT by status or timer state, so
    // pausing/resuming or a status change never reshuffles the dock list.
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      dueDate: true,
      serviceId: true,
      createdById: true,
      project: { select: { id: true, name: true } },
      service: { select: { name: true } },
      checklist: { orderBy: { orderIndex: "asc" }, select: { id: true, text: true, isDone: true } },
    },
  });

  const timerStates = await getTaskTimerStates(session.userId, rows.map((r) => r.id));

  // Related guides: batch one KB query across the active tasks' services.
  const serviceIds = [...new Set(rows.map((r) => r.serviceId).filter((s): s is string => !!s))];
  const kbRows = serviceIds.length
    ? await prisma.kbArticle.findMany({
        where: { companyId: session.companyId, serviceId: { in: serviceIds } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, serviceId: true, projectId: true, externalUrl: true },
      })
    : [];

  const isManager = await hasPermission(session.companyId, session.role, "task:manage");
  const base = appBaseUrl();

  const tasks: ExtTask[] = rows.map((t) => {
    const isReviewer = session.userId === t.createdById;
    const kb: ExtKbLink[] = kbRows
      .filter((k) => k.serviceId === t.serviceId && (k.projectId === t.project.id || k.projectId === null))
      .slice(0, 6)
      .map((k) => ({
        id: k.id,
        title: k.title,
        scope: k.projectId ? "project" : "general",
        // Link articles open their external URL directly; others deep-link to the app.
        url: k.externalUrl ?? `${base}/knowledge-base/${k.id}`,
      }));
    const timer = timerStates.get(t.id) ?? {
      status: "NONE" as const,
      baseSeconds: 0,
      runStartedAtMs: null,
    };
    return {
      id: t.id,
      name: t.name,
      projectId: t.project.id,
      projectName: t.project.name,
      serviceName: t.service?.name ?? null,
      // The query filters to WORK_STATES, so this is always a dock status (no HOLD).
      status: t.status as ExtTask["status"],
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      isAssignee: true, // every task in this feed is assigned to the user
      isReviewer,
      canTime: canUseTimer(t.status, true, isReviewer),
      canEdit: true, // assignee may edit the checklist
      timer,
      checklist: t.checklist,
      kb,
      webUrl: `${base}/tasks/${t.id}`,
    };
  });

  // Kept in the stable query order (creation time) — no status/running re-sort,
  // so a task stays put when you pause, resume, or change its status.
  return { tasks, serverTimeMs: Date.now() };
}
