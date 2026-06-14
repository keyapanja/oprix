"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  await prisma.notification.updateMany({
    where: { userId: session.userId, isRead: false },
    data: { isRead: true },
  });
  return { ok: true };
}
