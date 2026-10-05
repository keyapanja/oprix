// Reading a biometric device's punch trail.
//
// The device writes one row per employee per day and a single string holding
// every scan of that day, e.g.
//
//   "09:40:in(TD),13:15:out(TD),15:16:(TD),18:00:in(TD),"
//
// …where the direction is sometimes blank (the person scanned, the device
// didn't decide which way) and the trailing comma is always there. Everything
// here is pure so the same arithmetic runs on the server (import, aggregates)
// and in the browser (the filtered views), and so the figures Oprix shows can
// be checked against the ones the device printed.

export type PunchDir = "in" | "out" | null;
export type Punch = { min: number; dir: PunchDir };

/** "09:40" → 580. Returns null for "", "00:00" is a real 0. */
export function toMin(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || mi > 59) return null;
  return h * 60 + mi;
}

/** 580 → "09:40". Minutes past midnight; rolls over past 24h for night shifts. */
export function hhmm(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return "";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 500 → "8h 20m". Durations, not clock times, so hours aren't capped at 24. */
export function hoursMin(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min) || min <= 0) return "0h";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 500 → "8.3" (hours, one decimal) for totals and chart axes. */
export function hoursDec(min: number): number {
  return Math.round((min / 60) * 10) / 10;
}

/**
 * The device's duration columns ("8:20", "00:00", "10:5") in minutes. Separate
 * from toMin because these are elapsed time, not a time of day — so "26:30" is
 * a legitimate 26½ hours, not an invalid clock reading.
 */
export function durToMin(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,3}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Split a punch trail into ordered scans. Tolerates the blank direction, the
 * "(TD)" device suffix, seconds, stray spaces and the trailing comma. Scans the
 * device wrote out of order are sorted; duplicates at the same minute and
 * direction collapse, because double-tapping the reader is not two events.
 */
export function parsePunchLog(raw: string | null | undefined): Punch[] {
  if (!raw) return [];
  const out: Punch[] = [];
  for (const piece of raw.split(",")) {
    const s = piece.trim();
    if (!s) continue;
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*:?\s*(in|out)?/i.exec(s);
    if (!m) continue;
    const min = Number(m[1]) * 60 + Number(m[2]);
    if (!Number.isFinite(min) || Number(m[2]) > 59) continue;
    const dir = m[4] ? (m[4].toLowerCase() as "in" | "out") : null;
    out.push({ min, dir });
  }
  out.sort((a, b) => a.min - b.min);
  return out.filter((p, i) => {
    const prev = out[i - 1];
    return !prev || prev.min !== p.min || prev.dir !== p.dir;
  });
}

export type Session = { in: number; out: number | null };

/**
 * The scans that are real events, with the device's echoes dropped.
 *
 * The device re-reads a badge a minute or two after it accepts one and writes
 * the second read with no direction — "09:15:out(TD),09:16:(TD)". Treating
 * those as events makes nonsense of any pairing: on 1 Sep, Mann's trail pairs
 * down to 51 minutes "inside" across a nine-hour day. Dropping a directionless
 * scan that lands within ECHO_MIN of the one before it takes the sample export
 * from 93 coherently-paired days to 194.
 *
 * Only directionless scans are dropped, and only for pairing — the first and
 * last scan of the day are still taken from the full trail, because that is
 * what the device's own In/Out columns report.
 */
const ECHO_MIN = 3;

export function realScans(punches: Punch[]): Punch[] {
  return punches.filter((p, i) => !(p.dir === null && i > 0 && p.min - punches[i - 1].min <= ECHO_MIN));
}

/**
 * In→out pairs. A directionless scan is treated as whichever direction is due
 * next; a trailing "in" leaves its session open rather than inventing an exit.
 */
export function pairSessions(punches: Punch[]): Session[] {
  const sessions: Session[] = [];
  let open: number | null = null;
  for (const p of punches) {
    const dir = p.dir ?? (open === null ? "in" : "out");
    if (dir === "in") {
      // Two "in"s in a row: the first session never closed. Keep it open-ended
      // rather than dropping it, so the gap is visible instead of invented.
      if (open !== null) sessions.push({ in: open, out: null });
      open = p.min;
    } else if (open !== null) {
      sessions.push({ in: open, out: p.min });
      open = null;
    }
  }
  if (open !== null) sessions.push({ in: open, out: null });
  return sessions;
}

/**
 * Whether the day's scans read as clean in/out pairs. Only then does the time
 * between them mean anything: on the other 54% of days the directions are too
 * garbled to say where the breaks were, and a figure derived from them would
 * look exactly as authoritative as one that isn't wrong.
 */
export function isCoherent(sessions: Session[]): boolean {
  return sessions.length > 0 && sessions.every((x) => x.out !== null);
}

export type DayFigures = {
  punches: Punch[];
  sessions: Session[];
  /** First and last scan of the day, whatever direction they claim to be. */
  firstIn: number | null;
  lastOut: number | null;
  /** last − first. The figure the device's "Work Dur." column is comparable to. */
  spanMin: number;
  /** True when the scans pair cleanly, so the break pattern can be read. */
  coherent: boolean;
  /** Time between in/out pairs — null unless the day pairs cleanly. */
  insideMin: number | null;
  /** Time away between the first and last scan — null unless it pairs cleanly. */
  awayMin: number | null;
  /** Minutes past (shift start + grace). 0 when on time or no shift is known. */
  lateMin: number;
  /** Minutes past shift start ignoring grace, for "late by any measure" views. */
  rawLateMin: number;
  /** Minutes the last scan fell short of shift end. */
  earlyMin: number;
};

export type ShiftWindow = {
  /** Shift start in minutes, or null when the person has no shift assigned. */
  startMin: number | null;
  endMin: number | null;
  graceMin: number;
  /**
   * False on a day nobody was due in — a weekly off or a holiday. Lateness is
   * then left at zero, because there was no time to be late for. Defaults to
   * true so a caller that doesn't know the work calendar still gets a figure.
   */
  expected?: boolean;
};

export function computeDay(punchLog: string | null | undefined, shift: ShiftWindow): DayFigures {
  const punches = parsePunchLog(punchLog);
  const sessions = pairSessions(realScans(punches));
  const coherent = isCoherent(sessions);
  // First and last come from the full trail, not the cleaned one: the device's
  // own In/Out columns include its trailing echo (Ronit's 1 Sep out is 17:22,
  // the blank re-read after a 17:17 out), and our figure has to be comparable.
  const firstIn = punches.length ? punches[0].min : null;
  const lastOut = punches.length ? punches[punches.length - 1].min : null;
  const spanMin = firstIn !== null && lastOut !== null ? Math.max(0, lastOut - firstIn) : 0;
  const insideMin = coherent ? sessions.reduce((n, x) => n + Math.max(0, x.out! - x.in), 0) : null;

  const { startMin, endMin, graceMin, expected = true } = shift;
  const late = (from: number) =>
    !expected || firstIn === null || startMin === null ? 0 : Math.max(0, firstIn - (startMin + from));

  return {
    punches,
    sessions,
    firstIn,
    lastOut,
    spanMin,
    coherent,
    insideMin,
    awayMin: insideMin === null ? null : Math.max(0, spanMin - insideMin),
    lateMin: late(graceMin),
    rawLateMin: late(0),
    earlyMin: lastOut === null || endMin === null ? 0 : Math.max(0, endMin - lastOut),
  };
}

// ---- The device's Status column -------------------------------------------

/**
 * The Status column is not one word — it is a weekly-off prefix, a verdict and
 * a "(No OutPunch)" note, any of which may be missing:
 *
 *   "Present"  "Absent"  "WeeklyOff"  "WeeklyOff Present"  "½Present"
 *   "Absent (No OutPunch)"  "WeeklyOff  ½Present"  "WeeklyOff Absent"
 *
 * "½" arrives as a CP1252 0xbd, so the half-day test looks at the tail of the
 * word rather than comparing the whole string.
 */
export type DeviceStatus = {
  raw: string;
  /** The device treats the date as a weekly rest day for this person. */
  restDay: boolean;
  /** Its verdict on the day's work; null when it only said "weekly off". */
  kind: "present" | "half" | "absent" | "holiday" | "leave" | null;
  /** It saw an entry scan but no matching exit. */
  noOutPunch: boolean;
  /** One short phrase for the UI. */
  label: string;
};

export function parseDeviceStatus(s: string | null | undefined): DeviceStatus {
  const raw = (s ?? "").trim();
  let rest = raw;

  const noOutPunch = /\(\s*no\s*outpunch\s*\)/i.test(rest);
  rest = rest.replace(/\(\s*no\s*outpunch\s*\)/gi, " ");

  const restDay = /weekly\s*off/i.test(rest);
  rest = rest.replace(/weekly\s*off/gi, " ").trim();

  const word = rest.replace(/\s+/g, " ").toLowerCase();
  let kind: DeviceStatus["kind"] = null;
  if (/present$/.test(word)) kind = word === "present" ? "present" : "half";
  else if (word === "absent") kind = "absent";
  else if (word === "holiday") kind = "holiday";
  else if (word.startsWith("leave") || word === "onleave") kind = "leave";

  let label: string;
  if (restDay && (kind === "present" || kind === "half")) {
    label = kind === "half" ? "Half day on a day off" : "Worked a day off";
  } else if (restDay) {
    label = noOutPunch ? "Day off · no exit scan" : "Weekly off";
  } else if (kind === "present") label = noOutPunch ? "Present · no exit scan" : "Present";
  else if (kind === "half") label = "Half day";
  else if (kind === "absent") label = noOutPunch ? "Absent · no exit scan" : "Absent";
  else if (kind === "holiday") label = "Holiday";
  else if (kind === "leave") label = "On leave";
  else label = raw || "—";

  return { raw, restDay, kind, noOutPunch, label };
}

/** The device's Status as one short phrase. */
export function deviceStatusLabel(s: string | null | undefined): string {
  return parseDeviceStatus(s).label;
}

/**
 * Device status → the Oprix AttendanceType it corresponds to, if any. A rest
 * day the person didn't work maps to nothing: "weekly off" is the absence of an
 * expectation, not an attendance verdict, and Oprix derives non-working days
 * from Company.workWeek instead.
 */
export function deviceStatusToType(
  s: string | null | undefined,
): "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY" | null {
  const st = parseDeviceStatus(s);
  if (st.kind === "present") return "PRESENT";
  if (st.kind === "half") return "HALF_DAY";
  if (st.restDay) return null; // incl. "WeeklyOff Absent" — nothing was expected
  if (st.kind === "absent") return "ABSENT";
  if (st.kind === "leave") return "LEAVE";
  if (st.kind === "holiday") return "HOLIDAY";
  return null;
}

// ---- Disagreements worth a human decision ---------------------------------

export type DayFlag =
  | "punches-on-non-working" // device called it off/absent, yet someone scanned
  | "worked-not-counted" // scans exist but the device counted 00:00
  | "no-exit" // the device itself recorded no exit scan
  | "single-punch"; // exactly one scan all day

export const FLAG_LABELS: Record<DayFlag, string> = {
  "punches-on-non-working": "Scans on a day the device marked off",
  "worked-not-counted": "Device counted no hours despite scans",
  "no-exit": "Never scanned out",
  "single-punch": "Only one scan all day",
};

export function dayFlags(args: {
  figures: DayFigures;
  deviceStatus: string | null | undefined;
  deviceWorkMin: number | null | undefined;
}): DayFlag[] {
  const { figures, deviceStatus, deviceWorkMin } = args;
  const st = parseDeviceStatus(deviceStatus);
  const scanned = figures.punches.length > 0;
  const worked = st.kind === "present" || st.kind === "half";
  const flags: DayFlag[] = [];

  // Each test below is narrowed to where the device is actually contradicting
  // itself. Outside a shift it legitimately counts no hours and records no
  // lateness, so a rest day worked is reported as its own thing — not as three
  // separate disagreements about the same morning.

  // Scans on a day the device wrote off. "WeeklyOff Present" is excluded: there
  // the device already acknowledged the work, so there is nothing to decide.
  if (scanned && !worked && (st.restDay || st.kind === "absent" || st.kind === "holiday")) {
    flags.push("punches-on-non-working");
  }
  if (scanned && worked && !st.restDay && figures.spanMin > 0 && (deviceWorkMin ?? 0) === 0) {
    flags.push("worked-not-counted");
  }
  // Lateness is deliberately not compared. This device applies its own 15-minute
  // grace — across the sample export the latest arrival it called on time was
  // exactly 15 minutes past the shift, the earliest it called late was 16, and
  // it never missed a genuinely late arrival. So a difference between its LateBy
  // and ours is the two grace settings differing, which is the point of having
  // one, not a fault. Both figures are shown side by side instead.
  // Only the device's own "(No OutPunch)" note counts here. Deriving it from our
  // pairing instead would flag 306 of the sample's 418 scanned days, because the
  // device so often labels the last scan of the day "in".
  if (figures.punches.length === 1) flags.push("single-punch");
  else if (scanned && st.noOutPunch) flags.push("no-exit");

  return flags;
}
