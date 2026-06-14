import "server-only";
import { prisma } from "@/lib/db";

/** Append a human-readable entry to a task's (or any entity's) change history. */
export async function logActivity(opts: {
  companyId: string;
  actorId: string;
  actorLabel: string;
  entityType: string;
  entityId: string;
  message: string;
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      companyId: opts.companyId,
      actorId: opts.actorId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      action: opts.message,
      meta: { actor: opts.actorLabel },
    },
  });
}

/** Best-effort display label for the current user (employee name, else email). */
export async function actorLabel(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, employee: { select: { fullName: true } } },
  });
  return user?.employee?.fullName ?? user?.email ?? "Someone";
}
