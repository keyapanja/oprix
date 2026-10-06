// Which hours a shift asks for on a given date.
//
// A shift has its regular timing, may have different timings on some weekdays
// (a short Saturday), and a special day can change them again for particular
// dates. Every attendance figure — lateness, leaving early, the hours a day
// asks for — is taken against the timing that applies on that date, resolved
// when attendance is read so that a correction reaches every report at once.
//
// Pure and isomorphic: the roster resolves it on the server, a person's page
// in the browser, and both have to arrive at the same answer.

import { toMin } from "@/lib/attendance/punches";

/** One day's hours: when it starts and ends, the grace on arrival, and lunch. */
export type DayTiming = { start: string; end: string; graceMinutes: number; lunchMinutes: number };

/** Weekdays whose hours differ from the regular ones, keyed 0 (Sun) – 6 (Sat). */
export type WeekdayTimings = Partial<Record<number, DayTiming>>;

/** What a shift contributes to the lookup. All null = no shift at all. */
export type ShiftTimings = {
  id: string | null;
  startTime: string | null;
  endTime: string | null;
  graceMinutes: number;
  lunchMinutes: number;
  weekdays: WeekdayTimings;
};

/** A dated change to some shifts' hours, as the views receive it. */
export type SpecialDay = {
  id: string;
  /** Inclusive ISO dates. */
  from: string;
  to: string;
  timing: DayTiming;
  /** A working day for these shifts even where it would normally be off. */
  workingDay: boolean;
  note: string | null;
  shiftIds: string[];
};

export type AppliedTiming = DayTiming & {
  /** Where the hours came from: the shift's own, its weekday ones, or a special day's. */
  source: "regular" | "weekday" | "special";
  special: SpecialDay | null;
};

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const HHMM = /^\d{2}:\d{2}$/;
const minutes = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

/** A tolerant read of WorkShift.weekdayTimings: anything malformed is skipped, not thrown. */
export function parseWeekdayTimings(json: unknown): WeekdayTimings {
  const out: WeekdayTimings = {};
  if (!json || typeof json !== "object" || Array.isArray(json)) return out;
  for (const [key, raw] of Object.entries(json as Record<string, unknown>)) {
    const day = Number(key);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    if (typeof t.start !== "string" || typeof t.end !== "string" || !HHMM.test(t.start) || !HHMM.test(t.end)) continue;
    out[day] = { start: t.start, end: t.end, graceMinutes: minutes(t.graceMinutes), lunchMinutes: minutes(t.lunchMinutes) };
  }
  return out;
}

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/**
 * The special day covering this shift on this date. Where two overlap the one
 * added later wins, so a correction can be laid over an earlier change —
 * callers pass them oldest first.
 */
export function specialOn(shiftId: string, dateISO: string, specials: SpecialDay[]): SpecialDay | null {
  let hit: SpecialDay | null = null;
  for (const s of specials) {
    if (s.from <= dateISO && dateISO <= s.to && s.shiftIds.includes(shiftId)) hit = s;
  }
  return hit;
}

/**
 * The hours a shift asks for on a date: a special day's if one covers it, else
 * the shift's timing for that weekday, else its regular one. Null when there
 * is no shift, and then nothing is measured against anything.
 */
export function timingOn(shift: ShiftTimings, dateISO: string, specials: SpecialDay[]): AppliedTiming | null {
  if (!shift.id || !shift.startTime || !shift.endTime) return null;
  const special = specialOn(shift.id, dateISO, specials);
  if (special) return { ...special.timing, source: "special", special };
  const weekday = shift.weekdays[weekdayOf(dateISO)];
  if (weekday) return { ...weekday, source: "weekday", special: null };
  return {
    start: shift.startTime,
    end: shift.endTime,
    graceMinutes: shift.graceMinutes,
    lunchMinutes: shift.lunchMinutes,
    source: "regular",
    special: null,
  };
}

/** A timing's length in minutes, across midnight for a night shift. Null when start = end. */
export function timingLengthMin(t: DayTiming): number | null {
  const start = toMin(t.start);
  const end = toMin(t.end);
  if (start === null || end === null || start === end) return null;
  return end > start ? end - start : end + 1440 - start;
}

/** The hours on site a day asks for: its length less lunch. Null when that leaves nothing. */
export function standardMin(t: DayTiming | null): number | null {
  if (!t) return null;
  const length = timingLengthMin(t);
  if (length === null) return null;
  const standard = length - t.lunchMinutes;
  return standard > 0 ? standard : null;
}

/** The window lateness and leaving early are measured against. */
export function windowOf(t: DayTiming | null): { startMin: number | null; endMin: number | null; graceMin: number } {
  if (!t) return { startMin: null, endMin: null, graceMin: 0 };
  return { startMin: toMin(t.start), endMin: toMin(t.end), graceMin: t.graceMinutes };
}
