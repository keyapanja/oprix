import "server-only";
import { prisma } from "@/lib/db";
import { sendEventReminders } from "@/lib/calendar/reminders";
import { lateLoginNames } from "@/lib/attendance/status";
import { notifyLateLogins } from "@/lib/notifications/late";

export type CronSummary = {
  companies: number;
  remindersRun: number;
  lateNotifiedCompanies: number;
  lateNamesTotal: number;
};

/**
 * Daily scheduled work, run across every company. Idempotent — safe to call
 * more than once a day: reminders claim `reminderSentAt`, and late notices
 * dedupe per admin per day. Triggered by GET/POST /api/cron with the CRON_SECRET.
 * Until this is wired to a scheduler, the same jobs still fire lazily on page
 * loads (app shell + attendance page) as a fallback.
 */
export async function runDailyJobs(): Promise<CronSummary> {
  const companies = await prisma.company.findMany({
    select: { id: true, timezone: true, eventReminderEnabled: true, eventReminderTime: true },
  });

  let remindersRun = 0;
  let lateNotifiedCompanies = 0;
  let lateNamesTotal = 0;

  for (const c of companies) {
    const tz = c.timezone ?? "Asia/Kolkata";

    if (c.eventReminderEnabled) {
      try {
        await sendEventReminders({ companyId: c.id, tz, enabled: true, time: c.eventReminderTime ?? "09:00" });
        remindersRun++;
      } catch (e) {
        console.error(`[cron] reminders failed for ${c.id}:`, e);
      }
    }

    try {
      const { dateISO, names } = await lateLoginNames(c.id, tz);
      if (names.length) {
        await notifyLateLogins(c.id, dateISO, names);
        lateNotifiedCompanies++;
        lateNamesTotal += names.length;
      }
    } catch (e) {
      console.error(`[cron] late-check failed for ${c.id}:`, e);
    }
  }

  return { companies: companies.length, remindersRun, lateNotifiedCompanies, lateNamesTotal };
}
