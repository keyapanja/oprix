import "server-only";
import { prisma } from "@/lib/db";
import { sendEventReminders } from "@/lib/calendar/reminders";
import { sendFormReminders } from "@/lib/forms/notify-cron";
import { runRecurringTasks } from "@/lib/tasks/recurring-cron";

export type CronSummary = {
  companies: number;
  remindersRun: number;
  formRemindersFired: number;
  recurringTasksCreated: number;
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
  let formRemindersFired = 0;
  let recurringTasksCreated = 0;
  // PUNCH MODULE paused: late-login notices are disabled (with punch removed,
  // no one clocks in, so they'd flag everyone daily). Kept at 0; see
  // docs/PUNCH-MODULE.md to restore.
  const lateNotifiedCompanies = 0;
  const lateNamesTotal = 0;

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
      formRemindersFired += await sendFormReminders({ companyId: c.id, tz });
    } catch (e) {
      console.error(`[cron] form reminders failed for ${c.id}:`, e);
    }

    try {
      recurringTasksCreated += await runRecurringTasks({ companyId: c.id, tz });
    } catch (e) {
      console.error(`[cron] recurring tasks failed for ${c.id}:`, e);
    }
  }

  return {
    companies: companies.length,
    remindersRun,
    formRemindersFired,
    recurringTasksCreated,
    lateNotifiedCompanies,
    lateNamesTotal,
  };
}
