import "server-only";
import { prisma } from "@/lib/db";
import { dateAtUTC, shiftISO, todayISO } from "@/lib/dates";
import { isWorkingDay, parseWorkWeek, type WorkWeek } from "@/lib/leave/work-week";
import { computeDay, dayFlags, parseDeviceStatus, readBreaks, toMin, type BreakRule } from "@/lib/attendance/punches";

// Everything the attendance views read. The per-day arithmetic deliberately
// isn't done here: the browser recomputes it from the punch trail (see
// lib/attendance/punches.ts) so that changing a filter or a shift's grace window
// doesn't need a round trip, and so one implementation serves both sides.

/** One imported employee-day, as the view receives it. */
export type DayRecord = {
  dateISO: string;
  /** Oprix's stored verdict (the device's, unless an admin overrode it). */
  type: "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY";
  /** True when an admin set the status by hand. */
  manual: boolean;
  shiftCode: string | null;
  punchLog: string | null;
  deviceIn: string | null;
  deviceOut: string | null;
  deviceWorkMin: number | null;
  deviceLateMin: number | null;
  deviceStatus: string | null;
};

export type PersonShift = {
  name: string | null;
  startTime: string | null;
  endTime: string | null;
  graceMinutes: number;
  /** True when this is the company default, not a shift set on the person. */
  fromDefault: boolean;
};

type ShiftRow = { name: string; startTime: string; endTime: string; graceMinutes: number } | null;

/** The company's break limit as stored, switched on or not. */
export type BreakLimit = BreakRule & { on: boolean };

const BREAK_LIMIT_SELECT = { breakLimitOn: true, breakLimitMinutes: true, breakLimitCount: true } as const;

function breakLimitOf(
  c: { breakLimitOn: boolean; breakLimitMinutes: number; breakLimitCount: number } | null,
): BreakLimit {
  // A missing company row reads as the schema defaults, not as "no limit".
  return { on: c?.breakLimitOn ?? true, minutes: c?.breakLimitMinutes ?? 10, count: c?.breakLimitCount ?? 2 };
}

/** The rule to judge days by — null while the limit is switched off. */
export function ruleOf(limit: BreakLimit): BreakRule | null {
  return limit.on ? { minutes: limit.minutes, count: limit.count } : null;
}

/**
 * The shift that applies to someone: their own, or the company default when
 * they have none. Resolved on read so a change to the default takes effect for
 * everyone relying on it without touching a single employee record.
 */
function resolveShift(own: ShiftRow, fallback: ShiftRow): PersonShift {
  const shift = own ?? fallback;
  return {
    name: shift?.name ?? null,
    startTime: shift?.startTime ?? null,
    endTime: shift?.endTime ?? null,
    graceMinutes: shift?.graceMinutes ?? 0,
    fromDefault: !own && !!fallback,
  };
}

export type PersonAttendance = {
  employee: {
    id: string;
    name: string;
    employeeCode: string;
    machineCode: string | null;
    department: string | null;
    designation: string | null;
  };
  shift: PersonShift;
  /** Inclusive window the view covers — the imported span, clipped to today. */
  from: string;
  to: string;
  days: DayRecord[];
  /** Dates (ISO) the person had approved leave for, within the window. */
  leaveDays: { dateISO: string; typeName: string; half: boolean }[];
  /** Company holidays within the window. */
  holidays: { dateISO: string; name: string }[];
  workWeek: WorkWeek;
  /** The limit as stored, for the control that changes it. */
  breakLimit: BreakLimit;
  /** Days with more breaks than this are highlighted; null when switched off. */
  breakRule: BreakRule | null;
  /** Null when no attendance has ever been imported for this company. */
  importedRange: { from: string; to: string } | null;
};

/** The span every import so far has covered, so a view can say "we have data
 *  from X to Y" rather than drawing empty months either side of it. */
export async function importedRange(
  companyId: string,
): Promise<{ from: string; to: string } | null> {
  const agg = await prisma.attendanceImport.aggregate({
    where: { companyId },
    _min: { fromDate: true },
    _max: { toDate: true },
  });
  const from = agg._min.fromDate;
  const to = agg._max.toDate;
  if (!from || !to) return null;
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function getPersonAttendance(args: {
  companyId: string;
  employeeId: string;
  from?: string;
  to?: string;
}): Promise<PersonAttendance | null> {
  const { companyId, employeeId } = args;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      machineCode: true,
      department: { select: { name: true } },
      designation: { select: { name: true } },
      workShift: { select: { name: true, startTime: true, endTime: true, graceMinutes: true } },
    },
  });
  if (!employee) return null;

  const covered = await importedRange(companyId);
  // Default window: this month so far, as the roster opens on. Never beyond
  // today; days past the latest import are left out by the view, not shown as
  // absences.
  const today = todayISO();
  const to = minISO(args.to ?? today, today);
  const from = minISO(args.from ?? `${today.slice(0, 7)}-01`, to);

  const [days, leave, holidays, company] = await Promise.all([
    prisma.attendance.findMany({
      where: { companyId, employeeId, date: { gte: dateAtUTC(from), lte: dateAtUTC(to) } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        type: true,
        markedManually: true,
        shiftCode: true,
        punchLog: true,
        deviceIn: true,
        deviceOut: true,
        deviceWorkMin: true,
        deviceLateMin: true,
        deviceStatus: true,
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        companyId,
        employeeId,
        status: "HR_APPROVED",
        deletedAt: null,
        startDate: { lte: dateAtUTC(to) },
        endDate: { gte: dateAtUTC(from) },
      },
      select: { startDate: true, endDate: true, isHalfDay: true, kind: true, leaveType: { select: { name: true } } },
    }),
    prisma.holiday.findMany({
      where: { companyId, deletedAt: null, date: { gte: dateAtUTC(from), lte: dateAtUTC(to) } },
      select: { date: true, name: true },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        workWeek: true,
        defaultWorkShift: { select: { name: true, startTime: true, endTime: true, graceMinutes: true } },
        ...BREAK_LIMIT_SELECT,
      },
    }),
  ]);

  const breakLimit = breakLimitOf(company);
  const leaveDays: PersonAttendance["leaveDays"] = [];
  for (const l of leave) {
    const label = l.kind === "WFH" ? "Work from home" : (l.leaveType?.name ?? "Leave");
    for (let d = iso(l.startDate); d <= iso(l.endDate); d = shiftISO(d, 1)) {
      if (d >= from && d <= to) leaveDays.push({ dateISO: d, typeName: label, half: l.isHalfDay });
    }
  }

  return {
    employee: {
      id: employee.id,
      name: employee.fullName,
      employeeCode: employee.employeeCode,
      machineCode: employee.machineCode,
      department: employee.department?.name ?? null,
      designation: employee.designation?.name ?? null,
    },
    shift: resolveShift(employee.workShift, company?.defaultWorkShift ?? null),
    from,
    to,
    days: days.map((d) => ({
      dateISO: iso(d.date),
      type: d.type,
      manual: d.markedManually,
      shiftCode: d.shiftCode,
      punchLog: d.punchLog,
      deviceIn: d.deviceIn,
      deviceOut: d.deviceOut,
      deviceWorkMin: d.deviceWorkMin,
      deviceLateMin: d.deviceLateMin,
      deviceStatus: d.deviceStatus,
    })),
    leaveDays,
    holidays: holidays.map((h) => ({ dateISO: iso(h.date), name: h.name })),
    workWeek: parseWorkWeek(company?.workWeek),
    breakLimit,
    breakRule: ruleOf(breakLimit),
    importedRange: covered,
  };
}

function minISO(a: string, b: string): string {
  return a < b ? a : b;
}

// ---- Company roster -------------------------------------------------------

export type RosterPerson = {
  id: string;
  name: string;
  employeeCode: string;
  machineCode: string | null;
  department: string | null;
  shiftName: string | null;
  shiftStart: string | null;
  graceMinutes: number;
  /** True when the shift above is the company default, not theirs. */
  shiftFromDefault: boolean;
  /** Days with at least one scan. */
  daysWorked: number;
  /** Days the device recorded as a no-show. */
  absences: number;
  /** Total minutes between first and last scan, summed. */
  totalMin: number;
  /** Arrivals after shift start + grace. */
  lateDays: number;
  /** Minutes late, summed over those days. */
  lateMin: number;
  /** Days carrying something a person should look at. */
  flagged: number;
  /** Working days certainly over the break limit. 0 while it's switched off. */
  longBreakDays: number;
  /** Working days a missing scan leaves undecided — counted neither way. */
  breakUnclearDays: number;
  /** Null when nothing has been imported for them. */
  lastDay: string | null;
};

/**
 * One row per employee for the roster. The per-day arithmetic repeats the
 * browser's, which is why both call the same helpers — the roster's "19 late"
 * has to be the number you see when you open that person.
 */
export async function getRoster(args: {
  companyId: string;
  from: string;
  to: string;
}): Promise<{ people: RosterPerson[]; from: string; to: string; breakLimit: BreakLimit }> {
  const { companyId, from, to } = args;
  // The work calendar is loaded here too, so the roster's "late" is the same
  // number you see on opening that person — lateness is only counted on days
  // somebody was due in.
  const [employees, rows, company, holidayRows] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        machineCode: true,
        department: { select: { name: true } },
        workShift: { select: { name: true, startTime: true, endTime: true, graceMinutes: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { companyId, date: { gte: dateAtUTC(from), lte: dateAtUTC(to) } },
      select: {
        employeeId: true,
        date: true,
        punchLog: true,
        deviceWorkMin: true,
        deviceStatus: true,
      },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        workWeek: true,
        defaultWorkShift: { select: { name: true, startTime: true, endTime: true, graceMinutes: true } },
        ...BREAK_LIMIT_SELECT,
      },
    }),
    prisma.holiday.findMany({
      where: { companyId, deletedAt: null, date: { gte: dateAtUTC(from), lte: dateAtUTC(to) } },
      select: { date: true },
    }),
  ]);

  const workWeek = parseWorkWeek(company?.workWeek);
  const holidays = new Set(holidayRows.map((h) => iso(h.date)));

  const byEmployee = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byEmployee.get(r.employeeId);
    if (list) list.push(r);
    else byEmployee.set(r.employeeId, [r]);
  }

  const fallback = company?.defaultWorkShift ?? null;
  const breakLimit = breakLimitOf(company);
  const rule = ruleOf(breakLimit);

  const people: RosterPerson[] = employees.map((e) => {
    const applies = resolveShift(e.workShift, fallback);
    const shift = {
      startMin: toMin(applies.startTime),
      endMin: toMin(applies.endTime),
      graceMin: applies.graceMinutes,
    };
    const mine = byEmployee.get(e.id) ?? [];
    let daysWorked = 0;
    let absences = 0;
    let totalMin = 0;
    let lateDays = 0;
    let lateMin = 0;
    let flagged = 0;
    let longBreakDays = 0;
    let breakUnclearDays = 0;
    let lastDay: string | null = null;

    for (const r of mine) {
      const d = iso(r.date);
      const expected = isWorkingDay(d, workWeek, holidays);
      const f = computeDay(r.punchLog, { ...shift, expected });
      const st = parseDeviceStatus(r.deviceStatus);
      if (f.punches.length) {
        daysWorked++;
        totalMin += f.spanMin;
        if (f.lateMin > 0) {
          lateDays++;
          lateMin += f.lateMin;
        }
      } else if (!st.restDay) absences++;
      if (
        dayFlags({
          figures: f,
          deviceStatus: r.deviceStatus,
          deviceWorkMin: r.deviceWorkMin,
        }).length
      ) {
        flagged++;
      }
      // Like lateness, only on days someone was due in: a few hours on a day off
      // isn't a working day to police the breaks of.
      const breaks = rule && expected ? readBreaks(f, rule) : null;
      if (breaks?.verdict === "over") longBreakDays++;
      else if (breaks?.verdict === "unclear") breakUnclearDays++;
      if (!lastDay || d > lastDay) lastDay = d;
    }

    return {
      id: e.id,
      name: e.fullName,
      employeeCode: e.employeeCode,
      machineCode: e.machineCode,
      department: e.department?.name ?? null,
      shiftName: applies.name,
      shiftStart: applies.startTime,
      graceMinutes: applies.graceMinutes,
      shiftFromDefault: applies.fromDefault,
      daysWorked,
      absences,
      totalMin,
      lateDays,
      lateMin,
      flagged,
      longBreakDays,
      breakUnclearDays,
      lastDay,
    };
  });

  return { people, from, to, breakLimit };
}

/** Recent uploads, for the import screen's history. */
export async function listImports(companyId: string, take = 10) {
  const rows = await prisma.attendanceImport.findMany({
    where: { companyId },
    orderBy: { uploadedAt: "desc" },
    take,
    select: {
      id: true,
      fileName: true,
      uploadedAt: true,
      fromDate: true,
      toDate: true,
      rowsRead: true,
      rowsSaved: true,
      rowsSkipped: true,
      unmatched: true,
      fileKey: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    uploadedAt: r.uploadedAt,
    from: iso(r.fromDate),
    to: iso(r.toDate),
    rowsRead: r.rowsRead,
    rowsSaved: r.rowsSaved,
    rowsSkipped: r.rowsSkipped,
    unmatched: r.unmatched,
    // Whether the upload itself was kept, which is what makes a re-run possible.
    hasFile: !!r.fileKey,
  }));
}
