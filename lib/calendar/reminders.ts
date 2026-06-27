import "server-only";
import { prisma } from "@/lib/db";
import { nowInZone, dateAtUTC } from "@/lib/dates";

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function internalUserIds(companyId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { companyId, isActive: true, role: { not: "CLIENT" } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Fan a notification out to every internal (non-client) user in a company. */
export async function notifyAllInternal(
  companyId: string,
  type: string,
  title: string,
  body: string,
  meta?: Record<string, string>,
): Promise<void> {
  const ids = await internalUserIds(companyId);
  if (!ids.length) return;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({ userId, type, title, body, meta })),
  });
}

/**
 * Lazy day-before reminder. There's no in-app cron, so this runs on page loads:
 * once the company-local clock passes the configured reminder time, the first
 * request that day fans out reminders for tomorrow's holidays/announcements. An
 * atomic claim on `reminderSentAt` makes it safe against concurrent requests and
 * idempotent (sent at most once per event). Best-effort — callers swallow errors.
 */
export async function sendEventReminders(opts: {
  companyId: string;
  tz: string;
  enabled: boolean;
  time: string;
}): Promise<void> {
  if (!opts.enabled) return;
  const { dateISO, time } = nowInZone(opts.tz);
  if (time < opts.time) return; // not yet the configured send time

  const tomorrow = dateAtUTC(addDaysISO(dateISO, 1));
  const [holidays, announcements] = await Promise.all([
    prisma.holiday.findMany({
      where: { companyId: opts.companyId, date: tomorrow, reminderSentAt: null, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.announcement.findMany({
      where: { companyId: opts.companyId, date: tomorrow, reminderSentAt: null, deletedAt: null },
      select: { id: true, title: true },
    }),
  ]);
  if (!holidays.length && !announcements.length) return;

  for (const h of holidays) {
    const claim = await prisma.holiday.updateMany({
      where: { id: h.id, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    if (claim.count === 1) {
      await notifyAllInternal(opts.companyId, "HOLIDAY", "Holiday tomorrow", `Reminder: ${h.name} is tomorrow.`, { holidayId: h.id });
    }
  }
  for (const a of announcements) {
    const claim = await prisma.announcement.updateMany({
      where: { id: a.id, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    if (claim.count === 1) {
      await notifyAllInternal(opts.companyId, "ANNOUNCEMENT", "Announcement tomorrow", `Reminder: ${a.title} is tomorrow.`, { announcementId: a.id });
    }
  }
}
