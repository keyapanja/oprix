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
 * The scans that are real events, with the device's re-reads dropped.
 *
 * The device re-reads a badge a moment after it accepts one and writes the
 * second read with no direction — "09:15:out(TD),09:16:(TD)". It doesn't count
 * them itself: its in/out labels simply alternate, and across the sample export
 * they alternate cleanly on 417 of 418 days once every directionless scan is
 * skipped — and every one of those landed 0–5 minutes after the scan before it.
 * Treating them as events makes nonsense of any pairing: on 1 Sep, Mann's trail
 * pairs down to 51 minutes "inside" across a nine-hour day, and a re-read just
 * after the day's last scan gets taken for the exit, inventing a few minutes in.
 *
 * Only for pairing — the first and last scan of the day are still taken from
 * the full trail, because that is what the device's own In/Out columns report.
 */
export function realScans(punches: Punch[]): Punch[] {
  // A directionless first scan is kept: there's nothing before it to re-read.
  return punches.filter((p, i) => i === 0 || p.dir !== null);
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
 * between them mean anything: on the other 47% of days a scan is missing (or
 * one too many), every label after it is off by one, and a figure derived from
 * them would look exactly as authoritative as one that isn't wrong.
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

// ---- Breaks ----------------------------------------------------------------

/**
 * The company's break limit: a day is over it when it holds more than `count`
 * breaks that each ran longer than `minutes`.
 */
export type BreakRule = { minutes: number; count: number };

/** Out at `from`, back in at `to`. */
export type Break = { from: number; to: number };

export type BreakReading = {
  /**
   * The day's breaks, in order — null when the scans don't pair up, because
   * then nobody can say which gaps were breaks and which were work.
   */
  breaks: Break[] | null;
  /**
   * How many breaks ran over the rule's length: the fewest and the most the
   * scans allow. One number when the breaks are known.
   */
  longMin: number;
  longMax: number;
  /** "unclear" only when the answer turns on how the scans are read. */
  verdict: "over" | "within" | "unclear";
};

/** "more than 2 breaks over 10 min" — the rule as a phrase, for labels. */
export function breakRuleText(rule: BreakRule): string {
  const length = `over ${rule.minutes} min`;
  if (rule.count === 0) return `any break ${length}`;
  return `more than ${rule.count} ${rule.count === 1 ? "break" : "breaks"} ${length}`;
}

/**
 * Hold a day's breaks against the limit. A break is the time between an exit
 * scan and the next entry, so lunch is a break like any other.
 *
 * On a day that pairs cleanly they are simply counted. On the rest a scan is
 * missing or one too many, and because the device labels by alternating, every
 * label after the slip is off by one — which gaps were breaks is genuinely
 * unknown. Rather than guess, every single-slip reading is tried (a scan missed
 * at each point in the day, or each scan being the spurious one) and the day is
 * called over, or within, only when all of them agree. Across the sample export
 * that settles 111 of the 171 such days without a guess among them; the other
 * 60 are "unclear" and count neither way.
 *
 * Null when there's nothing to judge: fewer than two scans.
 */
export function readBreaks(figures: DayFigures, rule: BreakRule): BreakReading | null {
  const t = realScans(figures.punches).map((p) => p.min);
  if (t.length < 2) return null;
  const isLong = (min: number) => min > rule.minutes;
  const verdict = (lo: number, hi: number): BreakReading["verdict"] =>
    lo > rule.count ? "over" : hi <= rule.count ? "within" : "unclear";

  // Clean pairs that used every scan (a stray leading "out" is skipped by the
  // pairing, which would otherwise pass for clean).
  if (figures.coherent && figures.sessions.length * 2 === t.length) {
    const s = figures.sessions;
    const breaks = s.slice(1).map((x, i) => ({ from: s[i].out!, to: x.in }));
    const long = breaks.filter((b) => isLong(b.to - b.from)).length;
    return { breaks, longMin: long, longMax: long, verdict: verdict(long, long) };
  }

  let lo = Infinity;
  let hi = -Infinity;
  const consider = (fewest: number, most: number) => {
    lo = Math.min(lo, fewest);
    hi = Math.max(hi, most);
  };

  if (t.length % 2 === 1) {
    // A scan missed just before t[j] (j = t.length: after the last one). Every
    // scan past that point moves one place along, and odd places are exits. The
    // gap the missing scan sits in holds a break of anything from no time to
    // all of it, so it counts towards the most but never the fewest.
    for (let j = 0; j <= t.length; j++) {
      let sure = 0;
      let maybe = 0;
      for (let i = 0; i + 1 < t.length; i++) {
        const gap = t[i + 1] - t[i];
        if (i + 1 === j) {
          if (isLong(gap)) maybe = 1;
        } else if ((i < j ? i : i + 1) % 2 === 1 && isLong(gap)) {
          sure++;
        }
      }
      consider(sure, sure + maybe);
    }
    // One scan too many: drop each in turn and read the rest as clean pairs.
    for (let k = 0; k < t.length; k++) {
      const rest = t.filter((_, i) => i !== k);
      let long = 0;
      for (let i = 1; i + 1 < rest.length; i += 2) if (isLong(rest[i + 1] - rest[i])) long++;
      consider(long, long);
    }
  } else {
    // An even count that still won't pair: the labels are out of step with the
    // clock itself (a scan written out of order). Nothing says where the breaks
    // fell — only that there can't be more long ones than long gaps.
    let gaps = 0;
    for (let i = 0; i + 1 < t.length; i++) if (isLong(t[i + 1] - t[i])) gaps++;
    consider(0, gaps);
  }
  return { breaks: null, longMin: lo, longMax: hi, verdict: verdict(lo, hi) };
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
