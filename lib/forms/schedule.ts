// Form fill-out reminder schedules. Isomorphic (no "server-only"): the builder
// edits the config, the cron evaluates it. Times are company-local "HH:MM".

import { z } from "zod";

export type ScheduleFrequency = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";

export type FormNotifySchedule = {
  frequency: ScheduleFrequency;
  time: string; // "HH:MM"
  weekday?: number; // 0=Sun .. 6=Sat (WEEKLY)
  monthday?: number; // 1 .. 31 (MONTHLY; clamps to the last day of short months)
  date?: string; // "YYYY-MM-DD" (ONCE)
};

export const ScheduleZ = z.object({
  frequency: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY"]),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  weekday: z.number().int().min(0).max(6).optional(),
  monthday: z.number().int().min(1).max(31).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function parseSchedule(json: unknown): FormNotifySchedule | null {
  const r = ScheduleZ.safeParse(json);
  return r.success ? (r.data as FormNotifySchedule) : null;
}

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const daysInMonthUTC = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();

/**
 * Should this schedule fire at the given company-local moment? Fires at most once
 * per day (runKey = today's date); the caller claims the runKey atomically so a
 * cron hit + a lazy page-load can't double-send.
 */
export function shouldFire(
  s: FormNotifySchedule,
  now: { dateISO: string; time: string },
  lastRunKey: string | null | undefined,
): { fire: boolean; runKey: string } {
  const runKey = now.dateISO;
  if (lastRunKey === runKey) return { fire: false, runKey };
  if (now.time < s.time) return { fire: false, runKey }; // not yet the send time

  const [y, m, d] = now.dateISO.split("-").map(Number);
  let match = false;
  switch (s.frequency) {
    case "DAILY":
      match = true;
      break;
    case "WEEKLY":
      match = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === (s.weekday ?? 1);
      break;
    case "MONTHLY":
      match = d === Math.min(s.monthday ?? 1, daysInMonthUTC(y, m));
      break;
    case "ONCE":
      match = now.dateISO === s.date;
      break;
  }
  return { fire: match, runKey };
}

/** Short human summary, e.g. "Every Monday at 09:00". */
export function describeSchedule(s: FormNotifySchedule): string {
  const at = ` at ${s.time}`;
  switch (s.frequency) {
    case "DAILY":
      return `Every day${at}`;
    case "WEEKLY":
      return `Every ${WEEKDAY_LABELS[s.weekday ?? 1]}${at}`;
    case "MONTHLY":
      return `Day ${s.monthday ?? 1} of each month${at}`;
    case "ONCE":
      return `Once on ${s.date ?? "—"}${at}`;
  }
}
