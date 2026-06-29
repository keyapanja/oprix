import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push/send";

/**
 * Single entry point for notifying users: writes the in-app bell row for each
 * user AND fires a Web Push to their subscribed devices. Route every
 * notification source through this so each type reaches people both in-app and
 * via OS push. Push is best-effort and never blocks the in-app write.
 */
export async function notify(
  userIds: string[],
  input: { type: string; title: string; body: string; meta?: Prisma.InputJsonValue },
): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;

  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      meta: input.meta,
    })),
  });

  await sendPushToUsers(ids, {
    title: input.title,
    body: input.body,
    type: input.type,
    meta: input.meta,
  }).catch(() => {});
}
