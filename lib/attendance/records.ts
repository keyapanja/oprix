import "server-only";
import { prisma } from "@/lib/db";
import { dateAtUTC, shiftISO, todayISO } from "@/lib/dates";
import { isWorkingDay, parseWorkWeek, type WorkWeek } from "@/lib/leave/work-week";
import { computeDay, dayFlags, parseDeviceStatus, toMin } from "@/lib/attendance/punches";

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
};

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
  // Default window: everything imported, but never beyond today — a report run
  // "to the end of the month" otherwise paints a fortnight of fake absences.
  const today = todayISO();
  const from = args.from ?? covered?.from ?? shiftISO(today, -30);
  const to = minISO(args.to ?? covered?.to ?? today, today);

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
    prisma.company.findUnique({ where: { id: companyId }, select: { workWeek: true } }),
  ]);

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
    shift: {
      name: employee.workShift?.name ?? null,
      startTime: employee.workShift?.startTime ?? null,
      endTime: employee.workShift?.endTime ?? null,
      graceMinutes: employee.workShift?.graceMinutes ?? 0,
    },
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
}): Promise<{ people: RosterPerson[]; from: string; to: string }> {
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
    prisma.company.findUnique({ where: { id: companyId }, select: { workWeek: true } }),
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

  const people: RosterPerson[] = employees.map((e) => {
    const shift = {
      startMin: toMin(e.workShift?.startTime),
      endMin: toMin(e.workShift?.endTime),
      graceMin: e.workShift?.graceMinutes ?? 0,
    };
    const mine = byEmployee.get(e.id) ?? [];
    let daysWorked = 0;
    let absences = 0;
    let totalMin = 0;
    let lateDays = 0;
    let lateMin = 0;
    let flagged = 0;
    let lastDay: string | null = null;

    for (const r of mine) {
      const d = iso(r.date);
      const f = computeDay(r.punchLog, { ...shift, expected: isWorkingDay(d, workWeek, holidays) });
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
      if (!lastDay || d > lastDay) lastDay = d;
    }

    return {
      id: e.id,
      name: e.fullName,
      employeeCode: e.employeeCode,
      machineCode: e.machineCode,
      department: e.department?.name ?? null,
      shiftName: e.workShift?.name ?? null,
      shiftStart: e.workShift?.startTime ?? null,
      graceMinutes: e.workShift?.graceMinutes ?? 0,
      daysWorked,
      absences,
      totalMin,
      lateDays,
      lateMin,
      flagged,
      lastDay,
    };
  });

  return { people, from, to };
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
  }));
}
