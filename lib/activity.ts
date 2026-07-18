import "server-only";
import { prisma } from "@/lib/db";
import { getActorLabel } from "@/lib/cache";

/** Append a human-readable entry to a task's (or any entity's) change history.
 *  Extra `meta` (e.g. a field-level diff) is merged alongside the actor label. */
export async function logActivity(opts: {
  companyId: string;
  actorId: string;
  actorLabel: string;
  entityType: string;
  entityId: string;
  message: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      companyId: opts.companyId,
      actorId: opts.actorId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      action: opts.message,
      meta: { actor: opts.actorLabel, ...(opts.meta ?? {}) },
    },
  });
}

/** Convenience: append a TASK history entry for the acting session. */
export async function logTaskActivity(
  session: { companyId: string; userId: string },
  taskId: string,
  message: string,
): Promise<void> {
  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: await actorLabel(session.userId),
    entityType: "TASK",
    entityId: taskId,
    message,
  });
}

/** Best-effort display label for the current user (employee name, else email). */
export async function actorLabel(userId: string): Promise<string> {
  return getActorLabel(userId);
}
