import "server-only";
import { prisma } from "@/lib/db";
import { nowInZone } from "@/lib/dates";
import { parseSchedule, shouldFire } from "@/lib/forms/schedule";
import { createTaskFromRecurring } from "@/lib/tasks/recurring";

/**
 * Fire any due recurring-task templates for a company: create the scheduled task
 * instance. Idempotent — each template claims today's runKey atomically (optimistic
 * lock on the previous value), so a cron hit and a lazy page-load can't double-create.
 * Returns how many tasks were created. Best-effort — callers may swallow errors.
 */
export async function runRecurringTasks(opts: { companyId: string; tz: string }): Promise<number> {
  const now = nowInZone(opts.tz);
  const templates = await prisma.recurringTask.findMany({
    where: { companyId: opts.companyId, active: true },
  });
  if (!templates.length) return 0;

  let created = 0;
  for (const rt of templates) {
    const schedule = parseSchedule(rt.schedule);
    if (!schedule) continue;

    const { fire, runKey } = shouldFire(schedule, now, rt.lastRunKey);
    if (!fire) continue;

    // Claim the run atomically: only one caller flips the (unchanged) runKey.
    const claim = await prisma.recurringTask.updateMany({
      where: { id: rt.id, lastRunKey: rt.lastRunKey },
      data: { lastRunKey: runKey },
    });
    if (claim.count !== 1) continue;

    try {
      const taskId = await createTaskFromRecurring(rt, now.dateISO);
      if (taskId) created++;
    } catch (e) {
      console.error(`[cron] recurring task ${rt.id} failed:`, e);
    }
  }
  return created;
}
