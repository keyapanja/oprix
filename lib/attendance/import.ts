import "server-only";
import type { AttendanceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { combineDateTimeUTC, dateAtUTC } from "@/lib/dates";
import { readAttendanceSheet, type SheetRow } from "@/lib/attendance/sheet";
import {
  durToMin,
  hhmm,
  parseDeviceStatus,
  parsePunchLog,
  deviceStatusToType,
  toMin,
} from "@/lib/attendance/punches";

// Loading a biometric-device report into Oprix.
//
// Two rules shape this:
//
//  1. **A re-import must be safe.** HR will re-upload an overlapping period
//     (last month plus the first days of this one) without thinking about it, so
//     every MACHINE-sourced row in the covered range is replaced wholesale
//     rather than merged. The device is the authority on its own data.
//
//  2. **A human's decision outranks the device.** A row an admin marked by hand
//     keeps its status; the import only attaches the punch trail to it, so the
//     scans are still visible beside the override.

export type UnmatchedCode = { code: string; name: string; rows: number };

export type ImportSummary = {
  importId: string;
  fileName: string;
  fromDate: string;
  toDate: string;
  days: number;
  rowsRead: number;
  rowsSaved: number;
  /** Rest days with no scans at all — the device padding its grid. Not stored. */
  restDaysSkipped: number;
  /** Rows left as an admin had marked them; the punch trail was still attached. */
  manualKept: number;
  people: number;
  unmatched: UnmatchedCode[];
  warnings: string[];
};

type Matched = { employeeId: string; row: SheetRow };

/** Device code → employee. Falls back to the Oprix employee code when the two
 *  happen to be the same string, which saves mapping anything on a fresh setup. */
async function codeIndex(companyId: string) {
  const employees = await prisma.employee.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, machineCode: true, employeeCode: true },
  });
  const byMachine = new Map<string, string>();
  const byEmployeeCode = new Map<string, string>();
  for (const e of employees) {
    if (e.machineCode) byMachine.set(e.machineCode.trim().toLowerCase(), e.id);
    byEmployeeCode.set(e.employeeCode.trim().toLowerCase(), e.id);
  }
  return (code: string): string | null => {
    const k = code.trim().toLowerCase();
    return byMachine.get(k) ?? byEmployeeCode.get(k) ?? null;
  };
}

export async function importAttendanceFile(args: {
  companyId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
  /** Storage key of the kept upload, so the run can be repeated after mapping. */
  fileKey?: string | null;
}): Promise<ImportSummary> {
  const { companyId, userId, fileName, buffer, fileKey } = args;
  const { rows, warnings } = readAttendanceSheet(buffer, fileName);
  if (!rows.length) throw new Error("No attendance rows were found in that file.");

  const resolve = await codeIndex(companyId);
  const matched: Matched[] = [];
  const unmatched = new Map<string, UnmatchedCode>();
  for (const row of rows) {
    const employeeId = resolve(row.machineCode);
    if (employeeId) matched.push({ employeeId, row });
    else {
      const key = row.machineCode.trim().toLowerCase();
      const seen = unmatched.get(key);
      if (seen) seen.rows++;
      else unmatched.set(key, { code: row.machineCode, name: row.name, rows: 1 });
    }
  }

  // The period is taken from the rows we can actually place, so a re-import
  // never clears days it had nothing to say about.
  const dates = matched.map((m) => m.row.dateISO).sort();
  const fromDate = dates[0] ?? rows.map((r) => r.dateISO).sort()[0];
  const toDate = dates[dates.length - 1] ?? rows.map((r) => r.dateISO).sort().at(-1)!;
  const employeeIds = [...new Set(matched.map((m) => m.employeeId))];

  // Last row wins if the file repeats an employee-day (two overlapping exports
  // pasted into one sheet) — matching the "re-import replaces" rule above.
  const perDay = new Map<string, Matched>();
  let restDaysSkipped = 0;
  for (const m of matched) {
    const status = parseDeviceStatus(m.row.status);
    const hasScans = parsePunchLog(m.row.punchLog).length > 0 || !!m.row.deviceIn;
    if (status.restDay && !hasScans) {
      restDaysSkipped++;
      continue;
    }
    perDay.set(`${m.employeeId}|${m.row.dateISO}`, m);
  }

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.attendanceImport.create({
      data: {
        companyId,
        fileName: fileName.slice(0, 200) || "attendance",
        fileKey: fileKey ?? null,
        uploadedById: userId,
        fromDate: dateAtUTC(fromDate),
        toDate: dateAtUTC(toDate),
        rowsRead: rows.length,
        rowsSaved: 0,
        rowsSkipped: [...unmatched.values()].reduce((n, u) => n + u.rows, 0),
        unmatched: unmatched.size
          ? [...unmatched.values()].map((u) => `${u.code} — ${u.name}`).join("\n").slice(0, 2000)
          : null,
      },
      select: { id: true },
    });

    if (!employeeIds.length) return { importId: batch.id, saved: 0, manualKept: 0 };

    const range = { gte: dateAtUTC(fromDate), lte: dateAtUTC(toDate) };

    // Rows an admin marked by hand, or that came from in-app punches, survive.
    const survivors = await tx.attendance.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        date: range,
        OR: [{ markedManually: true }, { source: { not: "MACHINE" } }],
      },
      select: { id: true, employeeId: true, date: true, markedManually: true },
    });
    const survivorKey = (employeeId: string, date: Date) =>
      `${employeeId}|${date.toISOString().slice(0, 10)}`;
    const survivorBy = new Map(survivors.map((s) => [survivorKey(s.employeeId, s.date), s]));

    // Everything else in the covered range is this import's to replace.
    await tx.attendance.deleteMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        date: range,
        source: "MACHINE",
        markedManually: false,
      },
    });

    const creates: Prisma.AttendanceCreateManyInput[] = [];
    let manualKept = 0;

    for (const [key, m] of perDay) {
      const { type, ...device } = deviceFields(m.row, batch.id);
      const survivor = survivorBy.get(key);
      if (survivor) {
        if (survivor.markedManually) {
          // Keep the human's verdict; attach the device's trail beside it.
          await tx.attendance.update({ where: { id: survivor.id }, data: device });
          manualKept++;
        } else {
          // An in-app punch row for the same day: the device has the fuller
          // record of it, so let the import take the row over.
          await tx.attendance.update({
            where: { id: survivor.id },
            data: { ...device, type, source: "MACHINE" },
          });
        }
        continue;
      }
      creates.push({
        companyId,
        employeeId: m.employeeId,
        date: dateAtUTC(m.row.dateISO),
        source: "MACHINE",
        type,
        ...device,
      });
    }

    if (creates.length) {
      await tx.attendance.createMany({ data: creates, skipDuplicates: true });
    }
    await tx.attendanceImport.update({ where: { id: batch.id }, data: { rowsSaved: perDay.size } });
    return { importId: batch.id, saved: perDay.size, manualKept };
  }, { timeout: 120_000 });

  return {
    importId: result.importId,
    fileName,
    fromDate,
    toDate,
    days: new Set(matched.map((m) => m.row.dateISO)).size,
    rowsRead: rows.length,
    rowsSaved: result.saved,
    restDaysSkipped,
    manualKept: result.manualKept,
    people: employeeIds.length,
    unmatched: [...unmatched.values()].sort((a, b) => b.rows - a.rows),
    warnings,
  };
}

/** The device's own columns, verbatim, plus the status we derive from them. */
function deviceFields(row: SheetRow, importId: string) {
  const scans = parsePunchLog(row.punchLog);
  const mapped = deviceStatusToType(row.status);
  const type: AttendanceType = mapped ?? (scans.length ? "PRESENT" : "ABSENT");
  // Round-tripped through minutes rather than sliced: this export writes "09:04",
  // but a variant that writes "9:04" or "09:04:33" would otherwise be pasted
  // into an ISO string that Date rejects, failing the whole import.
  const clock = (t: string, dateISO: string) => {
    const min = toMin(t);
    return min === null ? null : combineDateTimeUTC(dateISO, hhmm(min));
  };
  return {
    importId,
    type,
    shiftCode: row.shiftCode || null,
    punchLog: row.punchLog || null,
    deviceIn: row.deviceIn || null,
    deviceOut: row.deviceOut || null,
    deviceWorkMin: durToMin(row.workDur),
    deviceLateMin: durToMin(row.lateBy),
    deviceStatus: row.status || null,
    // clockIn/clockOut stay the canonical "when were they here" columns so the
    // rest of the app keeps reading one field, device or app.
    clockIn: clock(row.deviceIn, row.dateISO),
    clockOut: clock(row.deviceOut, row.dateISO),
  };
}

/** Map a device code onto an employee so the next import places its rows. */
export async function setMachineCode(
  companyId: string,
  employeeId: string,
  code: string | null,
): Promise<void> {
  const value = code?.trim() || null;
  await prisma.employee.updateMany({
    where: { id: employeeId, companyId, deletedAt: null },
    data: { machineCode: value },
  });
}
