"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * Mark notifications read. With no ids, marks all of the user's unread ones;
 * with ids, marks just those. Always scoped to the signed-in user.
 */
export async function markNotificationsRead(ids?: string[]): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  await prisma.notification.updateMany({
    where: {
      userId: session.userId,
      isRead: false,
      ...(ids && ids.length ? { id: { in: ids } } : {}),
    },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
  return { ok: true };
}

/** Permanently delete the given notifications (scoped to the signed-in user). */
export async function deleteNotifications(
  ids: string[],
): Promise<{ ok: boolean; deleted: number }> {
  const session = await getSession();
  if (!session || ids.length === 0) return { ok: false, deleted: 0 };
  const res = await prisma.notification.deleteMany({
    where: { userId: session.userId, id: { in: ids } },
  });
  revalidatePath("/notifications");
  return { ok: true, deleted: res.count };
}
