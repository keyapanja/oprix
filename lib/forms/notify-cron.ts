import "server-only";
import { prisma } from "@/lib/db";
import { nowInZone } from "@/lib/dates";
import { notify } from "@/lib/notifications/notify";
import { parseSchedule, shouldFire } from "@/lib/forms/schedule";

/**
 * Fire any due "please fill this out" reminders for a company's published forms.
 * Idempotent: each form claims today's runKey atomically (optimistic lock on the
 * previous value), so a cron hit and a lazy page-load can't double-send. Returns
 * how many forms fired. Best-effort — callers may swallow errors.
 */
export async function sendFormReminders(opts: { companyId: string; tz: string }): Promise<number> {
  const now = nowInZone(opts.tz);
  const forms = await prisma.form.findMany({
    where: { companyId: opts.companyId, deletedAt: null, status: "PUBLISHED", notifyEnabled: true },
    select: { id: true, title: true, audienceRoles: true, notifySchedule: true, notifyLastRunKey: true },
  });
  if (!forms.length) return 0;

  let fired = 0;
  for (const f of forms) {
    const schedule = parseSchedule(f.notifySchedule);
    if (!schedule || f.audienceRoles.length === 0) continue;

    const { fire, runKey } = shouldFire(schedule, now, f.notifyLastRunKey);
    if (!fire) continue;

    // Claim the run atomically: only one caller flips the (unchanged) runKey.
    const claim = await prisma.form.updateMany({
      where: { id: f.id, notifyLastRunKey: f.notifyLastRunKey },
      data: { notifyLastRunKey: runKey },
    });
    if (claim.count !== 1) continue;

    const users = await prisma.user.findMany({
      where: { companyId: opts.companyId, isActive: true, role: { in: f.audienceRoles } },
      select: { id: true },
    });
    await notify(
      users.map((u) => u.id),
      {
        type: "FORM",
        title: "Form to fill out",
        body: `Please fill out “${f.title}” today.`,
        meta: { formId: f.id },
      },
    );
    fired++;
  }
  return fired;
}
