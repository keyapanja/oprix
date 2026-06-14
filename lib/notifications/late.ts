import "server-only";
import { prisma } from "@/lib/db";

/**
 * Notifies attendance managers that employees haven't logged in yet. One
 * summary notification per admin per day (deduped by meta.date). Idempotent,
 * so it's safe to call whenever the attendance page is viewed for today.
 *
 * NOTE: without a scheduler this only fires when someone opens today's
 * attendance. A cron job would make it fully proactive.
 */
export async function notifyLateLogins(
  companyId: string,
  dateISO: string,
  lateNames: string[],
): Promise<void> {
  if (lateNames.length === 0) return;

  const admins = await prisma.user.findMany({
    where: { companyId, isActive: true, role: { in: ["SUPER_ADMIN", "HR_MANAGER"] } },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const n = lateNames.length;
  const title = `${n} ${n === 1 ? "employee hasn't" : "employees haven't"} logged in yet`;
  const body = lateNames.slice(0, 6).join(", ") + (n > 6 ? "…" : "");

  for (const a of admins) {
    const existing = await prisma.notification.findFirst({
      where: { userId: a.id, type: "LATE_LOGIN" },
      orderBy: { createdAt: "desc" },
      select: { id: true, meta: true },
    });
    const meta = existing?.meta as unknown as { date?: string } | null;
    if (meta?.date === dateISO) {
      await prisma.notification.update({
        where: { id: existing!.id },
        data: { title, body, isRead: false },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: a.id,
          type: "LATE_LOGIN",
          title,
          body,
          channel: "IN_APP",
          meta: { date: dateISO },
        },
      });
    }
  }
}
