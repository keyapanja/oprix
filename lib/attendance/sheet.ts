import "server-only";
import * as XLSX from "xlsx";

// Reading the biometric device's "Daily Attendance Report (Detailed Report)".
//
// The file is a report, not a table: a banner, then a repeating block per day —
// "Attendance Date : 29-Aug-2026", a "Department" line, a header row, then one
// row per employee. Columns are located by their header text rather than by
// index, so a firmware update that inserts a column doesn't silently shift
// every field by one.
//
// Both the device's own .xls (a real BIFF workbook) and a CSV re-export of the
// same report go through SheetJS, so there is a single code path for both.

export type SheetRow = {
  dateISO: string;
  department: string | null;
  machineCode: string;
  name: string;
  shiftCode: string;
  shiftIn: string;
  shiftOut: string;
  deviceIn: string;
  deviceOut: string;
  workDur: string;
  otDur: string;
  totalDur: string;
  lateBy: string;
  earlyBy: string;
  status: string;
  punchLog: string;
};

export type SheetReadResult = {
  rows: SheetRow[];
  /** Report-level period, when the banner states one. */
  reportRange: { from: string; to: string } | null;
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "29-Aug-2026" / "29 Aug 2026" / "Aug 29 2026" / "2026-08-29" → "2026-08-29". */
export function parseReportDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;

  m = /^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = /^([A-Za-z]{3,})\s+(\d{1,2})[, ]+(\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  // dd/mm/yyyy — day-first, matching the device's locale everywhere else.
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** The header labels we need, each with the aliases seen in the wild. */
const COLUMNS = {
  machineCode: ["e. code", "e.code", "ecode", "emp code", "employee code", "code"],
  name: ["name", "employee name"],
  shiftCode: ["shift"],
  shiftIn: ["s. intime", "s.intime", "shift intime", "shift in"],
  shiftOut: ["s. outtime", "s.outtime", "shift outtime", "shift out"],
  deviceIn: ["a. intime", "a.intime", "actual intime", "in time"],
  deviceOut: ["a. outtime", "a.outtime", "actual outtime", "out time"],
  workDur: ["work dur.", "work dur", "work duration"],
  otDur: ["ot", "ot dur.", "overtime"],
  totalDur: ["tot. dur.", "tot dur", "total dur.", "total duration"],
  lateBy: ["lateby", "late by"],
  earlyBy: ["earlygoingby", "early going by", "earlyby", "early by"],
  status: ["status"],
  punchLog: ["punch records", "punch record", "punches"],
} as const;

type ColumnKey = keyof typeof COLUMNS;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Map each needed field to its column index in this report's header row. */
function mapHeader(cells: string[]): Partial<Record<ColumnKey, number>> | null {
  const found: Partial<Record<ColumnKey, number>> = {};
  for (const [key, aliases] of Object.entries(COLUMNS) as [ColumnKey, readonly string[]][]) {
    const i = cells.findIndex((c) => aliases.includes(norm(c)));
    if (i !== -1) found[key] = i;
  }
  // "E. Code" + "Name" + "Status" together only occur on the real header row.
  if (found.machineCode === undefined || found.name === undefined || found.status === undefined) return null;
  return found;
}

export function readAttendanceSheet(buf: Buffer, fileName: string): SheetReadResult {
  const warnings: string[] = [];
  let wb: XLSX.WorkBook;
  try {
    // raw:false everywhere below wants formatted text; cellDates off keeps the
    // device's own "09:40" strings instead of turning them into 1899 Dates.
    wb = XLSX.read(buf, { type: "buffer", raw: false, cellDates: false });
  } catch {
    throw new Error(`Couldn't read ${fileName}. Expected the device's .xls / .xlsx report or a CSV of it.`);
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("That file has no sheets in it.");
  const ws = wb.Sheets[sheetName];

  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
  const cell = (row: string[] | undefined, i: number | undefined) =>
    row === undefined || i === undefined ? "" : String(row[i] ?? "").trim();

  let reportRange: { from: string; to: string } | null = null;
  let currentDate: string | null = null;
  let currentDept: string | null = null;
  let cols: Partial<Record<ColumnKey, number>> | null = null;
  const rows: SheetRow[] = [];
  let unparsedDates = 0;

  for (const raw of grid) {
    const cells = (raw ?? []).map((c) => String(c ?? ""));
    const joined = cells.filter(Boolean).join(" ").trim();
    if (!joined) continue;

    // "Aug 01 2026  To  Oct 01 2026" — the period the report was run for.
    if (!reportRange) {
      const m = /^(.+?)\s+To\s+(.+?)$/i.exec(joined);
      if (m) {
        const from = parseReportDate(m[1]);
        const to = parseReportDate(m[2]);
        if (from && to) reportRange = { from, to };
      }
    }

    if (/attendance date/i.test(joined)) {
      const after = joined.replace(/^.*attendance date\s*:?\s*/i, "");
      const parsed = parseReportDate(after.split(/\s{2,}/)[0] ?? after);
      if (parsed) currentDate = parsed;
      else {
        currentDate = null;
        unparsedDates++;
      }
      continue;
    }

    const first = cells.find((c) => c.trim())?.trim() ?? "";
    if (/^department\b/i.test(first)) {
      const after = cells.slice(cells.findIndex((c) => /^department\b/i.test(c.trim())) + 1);
      currentDept = after.find((c) => c.trim())?.trim() || null;
      continue;
    }

    const header = mapHeader(cells);
    if (header) {
      cols = header;
      continue;
    }
    if (!cols || !currentDate) continue;

    const machineCode = cell(cells, cols.machineCode);
    const name = cell(cells, cols.name);
    if (!machineCode || !name) continue;
    // Guard against a stray total/footer line landing in the data block.
    if (/^(total|grand total)$/i.test(machineCode)) continue;

    rows.push({
      dateISO: currentDate,
      department: currentDept,
      machineCode,
      name,
      shiftCode: cell(cells, cols.shiftCode),
      shiftIn: cell(cells, cols.shiftIn),
      shiftOut: cell(cells, cols.shiftOut),
      deviceIn: cell(cells, cols.deviceIn),
      deviceOut: cell(cells, cols.deviceOut),
      workDur: cell(cells, cols.workDur),
      otDur: cell(cells, cols.otDur),
      totalDur: cell(cells, cols.totalDur),
      lateBy: cell(cells, cols.lateBy),
      earlyBy: cell(cells, cols.earlyBy),
      status: cell(cells, cols.status),
      punchLog: cell(cells, cols.punchLog),
    });
  }

  if (!cols) {
    throw new Error(
      "Couldn't find the report's header row (E. Code / Name / Status). Export the Daily Attendance Report (Detailed) and upload that file unchanged.",
    );
  }
  if (unparsedDates) {
    warnings.push(`${unparsedDates} "Attendance Date" line${unparsedDates === 1 ? "" : "s"} had a date format we couldn't read; those days were skipped.`);
  }
  if (!rows.length) warnings.push("The header row was found but no employee rows followed it.");

  return { rows, reportRange, warnings };
}
