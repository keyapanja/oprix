/**
 * One-time import of historical leave / WFH records exported from the previous
 * operations system (CSV) into Oprix.
 *
 * Only imports rows for employees who CURRENTLY exist in Oprix (matched by
 * full name, case-insensitive, non-trashed). Rows for people who no longer
 * work here are skipped and listed. "Cancelled" rows are skipped (they were
 * never taken and Oprix has no cancelled state).
 *
 * DRY RUN by default — prints exactly what it would do and writes nothing.
 * Add --commit to actually insert. Safe to re-run: an already-imported record
 * (same employee + kind + dates + type) is detected and skipped.
 *
 *   # 1) preview against whichever DB $DATABASE_URL points at
 *   npx tsx prisma/import-leaves.ts "C:\Users\dell\Downloads\data (1).csv"
 *
 *   # 2) once the preview looks right, write it
 *   npx tsx prisma/import-leaves.ts "C:\Users\dell\Downloads\data (1).csv" --commit
 *
 * Flags:
 *   --commit            actually write (default is a read-only dry run)
 *   --no-create-types   don't create missing leave types; skip those rows instead
 *
 * The import runs against whatever DATABASE_URL is set. To load into PRODUCTION,
 * set DATABASE_URL to the prod connection string for this one command, e.g. (PowerShell):
 *   $env:DATABASE_URL="postgresql://…prod…"; npx tsx prisma/import-leaves.ts "…csv" --commit
 * If several companies exist, set COMPANY_ID to pick which one to import into.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CSV_PATH =
  process.argv.slice(2).find((a) => a.toLowerCase().endsWith(".csv")) ??
  "C:\\Users\\dell\\Downloads\\data (1).csv";
const COMMIT = process.argv.includes("--commit");
const CREATE_TYPES = !process.argv.includes("--no-create-types");

// Ex-employees to skip even if their rows are present (no longer with the company).
const EXCLUDE_NAMES = new Set([
  "abhishek sharma", "gaurav solanki", "mansi agarrwal", "monica verma",
  "riddhi jain", "shreya jain", "vinita kedia",
]);

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish: quoted fields with embedded commas/newlines, "" escapes)
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* ignore */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// Working-day counting (pure copy of lib/leave/work-week.ts) — only used to
// fill in the handful of rows whose "Number of Days" is blank.
// ---------------------------------------------------------------------------
type WorkWeek = { workingWeekdays: number[]; saturdayOffWeeks: number[] };
const DEFAULT_WORK_WEEK: WorkWeek = { workingWeekdays: [1, 2, 3, 4, 5, 6], saturdayOffWeeks: [] };

function parseWorkWeek(json: unknown): WorkWeek {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const wd = Array.isArray(j.workingWeekdays)
    ? [...new Set(j.workingWeekdays.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6))]
    : DEFAULT_WORK_WEEK.workingWeekdays;
  const so = Array.isArray(j.saturdayOffWeeks)
    ? [...new Set(j.saturdayOffWeeks.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 5))]
    : [];
  return { workingWeekdays: wd.sort((a, b) => a - b), saturdayOffWeeks: so.sort((a, b) => a - b) };
}
function nthWeekdayOfMonth(iso: string): number {
  return Math.floor((Number(iso.slice(8, 10)) - 1) / 7) + 1;
}
function isWorkingDay(iso: string, ww: WorkWeek, holidays: Set<string>): boolean {
  if (holidays.has(iso)) return false;
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (!ww.workingWeekdays.includes(dow)) return false;
  if (dow === 6 && ww.saturdayOffWeeks.includes(nthWeekdayOfMonth(iso))) return false;
  return true;
}
function countWorkingDays(startISO: string, endISO: string, ww: WorkWeek, holidays: Set<string>, isHalfDay: boolean): number {
  let count = 0;
  const d = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  while (d.getTime() <= end.getTime()) {
    if (isWorkingDay(d.toISOString().slice(0, 10), ww, holidays)) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (isHalfDay) return count >= 1 ? 0.5 : 0;
  return count;
}

// ---------------------------------------------------------------------------
// Request-type mapping. `target` is the Oprix leave-type name we resolve to
// (matched against existing types, created if missing). WFH has no leave type.
// ---------------------------------------------------------------------------
type Mapping =
  | { kind: "WFH" }
  | { kind: "LEAVE"; target: string; paidType: "PAID" | "UNPAID" };

const TYPE_MAP: Record<string, Mapping> = {
  "work from home": { kind: "WFH" },
  "annual paid leaves": { kind: "LEAVE", target: "Annual Paid Leave", paidType: "PAID" },
  "annual paid leave": { kind: "LEAVE", target: "Annual Paid Leave", paidType: "PAID" },
  "sick leave": { kind: "LEAVE", target: "Sick Leave", paidType: "PAID" },
  "lwp (leave without pay)": { kind: "LEAVE", target: "Unpaid Leave", paidType: "UNPAID" },
  "leave without pay": { kind: "LEAVE", target: "Unpaid Leave", paidType: "UNPAID" },
  bereavement: { kind: "LEAVE", target: "Bereavement Leave", paidType: "PAID" },
  "marriage days leave": { kind: "LEAVE", target: "Marriage Days Leave", paidType: "PAID" },
};

// Normalized key for fuzzy name matching: lowercase, alnum only, drop trailing "s".
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/s$/, "");

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------
/** "January 8, 2026" -> Date at UTC midnight (calendar date preserved, no TZ drift). */
function parseDateCell(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const tmp = new Date(t); // parsed as local midnight
  if (isNaN(tmp.getTime())) return null;
  return new Date(Date.UTC(tmp.getFullYear(), tmp.getMonth(), tmp.getDate()));
}
/** "1/7/2026 12:04pm" (M/D/YYYY, optional time) -> Date; falls back to date-only. */
function parseAppliedAt(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
  if (!m) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, mm, dd, yyyy, hh, min, ap] = m;
  let hour = hh ? Number(hh) : 12;
  if (ap) {
    const pm = ap.toLowerCase() === "pm";
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour, min ? Number(min) : 0));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Which half of the day, guessed from the reason text. Default FIRST. */
function halfPeriod(reason: string): "FIRST" | "SECOND" {
  const r = reason.toLowerCase();
  if (/\b(second|2nd)[\s-]*half\b/.test(r) || /\bhalf\b.*\b(afternoon|evening)\b/.test(r)) return "SECOND";
  return "FIRST";
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nOprix leave/WFH import — ${COMMIT ? "COMMIT (will write)" : "DRY RUN (no writes)"}`);
  console.log(`CSV: ${CSV_PATH}\n`);

  const raw = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(raw);
  const header = rows[0].map((h) => h.trim());
  const data = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const C = {
    type: col("Request Type"),
    start: col("Start Date"),
    end: col("End Date"),
    days: col("Number of Days"),
    status: col("Manual Leave Request Status"),
    reason: col("Reason for Request"),
    halfLeave: col("Half Day Leave"),
    halfWfh: col("Half-Day Work-from-Home Request"),
    name: col("Employee Name"),
    created: col("Created"),
    applied: col("Date When Application Was Requested"),
  };
  const missing = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) throw new Error(`CSV is missing expected column(s): ${missing.join(", ")}`);

  // --- resolve the target company ---
  const companies = await prisma.company.findMany({ select: { id: true, name: true, workWeek: true } });
  let company = companies.find((c) => c.id === process.env.COMPANY_ID) ?? null;
  if (!company) {
    if (companies.length === 1) company = companies[0];
    else {
      console.error(`Multiple companies found — set COMPANY_ID to one of:`);
      companies.forEach((c) => console.error(`  ${c.id}  ${c.name}`));
      process.exit(1);
    }
  }
  console.log(`Company: ${company.name} (${company.id})\n`);
  const ww = parseWorkWeek(company.workWeek);

  // --- employees (current only = not trashed) ---
  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, fullName: true },
  });
  const empByName = new Map<string, { id: string; fullName: string }>();
  for (const e of employees) {
    const k = e.fullName.trim().toLowerCase();
    if (!empByName.has(k)) empByName.set(k, e);
  }

  // --- existing leave types ---
  const existingTypes = await prisma.leaveType.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true },
  });
  const typeByNorm = new Map<string, { id: string; name: string }>();
  for (const t of existingTypes) typeByNorm.set(norm(t.name), t);
  console.log(`Existing leave types (${existingTypes.length}): ${existingTypes.map((t) => t.name).join(", ") || "(none)"}\n`);

  // Resolve (creating if needed) the leave-type id for a target name.
  const createdTypes: string[] = [];
  const typeCache = new Map<string, string | null>(); // target -> leaveTypeId (null = skip)
  async function resolveType(target: string, paidType: "PAID" | "UNPAID"): Promise<string | null> {
    if (typeCache.has(target)) return typeCache.get(target)!;
    const hit = typeByNorm.get(norm(target));
    if (hit) { typeCache.set(target, hit.id); return hit.id; }
    if (!CREATE_TYPES) { typeCache.set(target, null); return null; }
    let id: string;
    if (COMMIT) {
      const created = await prisma.leaveType.create({
        data: {
          companyId: company!.id,
          name: target,
          paidType,
          unlimited: true, // historical import: no fabricated quota — set real allowance later
          allowanceValue: 0,
        },
        select: { id: true },
      });
      id = created.id;
    } else {
      id = `(new:${target})`;
    }
    typeByNorm.set(norm(target), { id, name: target });
    typeCache.set(target, id);
    createdTypes.push(`${target} [${paidType}, unlimited]`);
    return id;
  }

  // --- counters / reports ---
  const unknownNames = new Map<string, number>();
  const unknownTypes = new Map<string, number>();
  const perEmployee = new Map<string, { leave: number; wfh: number }>();
  let cancelled = 0;
  let badDate = 0;
  let dupes = 0;
  let toInsert = 0;
  let inserted = 0;
  let skippedNoType = 0;
  let excluded = 0;

  for (const r of data) {
    const status = (r[C.status] ?? "").trim().toLowerCase();
    if (status !== "approved") { cancelled++; continue; } // Cancelled / anything not approved

    const rawName = (r[C.name] ?? "").trim();
    if (EXCLUDE_NAMES.has(rawName.toLowerCase())) { excluded++; continue; } // ex-employee
    const emp = empByName.get(rawName.toLowerCase());
    if (!emp) { unknownNames.set(rawName, (unknownNames.get(rawName) ?? 0) + 1); continue; }

    const rawType = (r[C.type] ?? "").trim();
    const mapping = TYPE_MAP[rawType.toLowerCase()];
    if (!mapping) { unknownTypes.set(rawType, (unknownTypes.get(rawType) ?? 0) + 1); continue; }

    const startDate = parseDateCell(r[C.start] ?? "");
    const endDate = parseDateCell(r[C.end] ?? "") ?? startDate;
    if (!startDate || !endDate) { badDate++; continue; }

    const isHalfDay =
      (r[C.halfLeave] ?? "").trim().toLowerCase() === "checked" ||
      (r[C.halfWfh] ?? "").trim().toLowerCase() === "checked";
    const reason = (r[C.reason] ?? "").trim();

    // days: use the CSV number where present; compute for blanks.
    const rawDays = (r[C.days] ?? "").trim();
    let days = rawDays ? Number(rawDays) : NaN;
    if (!Number.isFinite(days) || days <= 0) {
      const holidays = await holidaySetFor(company!.id, startDate, endDate);
      days = countWorkingDays(iso(startDate), iso(endDate), ww, holidays, isHalfDay) || (isHalfDay ? 0.5 : 1);
    }

    let leaveTypeId: string | null = null;
    if (mapping.kind === "LEAVE") {
      leaveTypeId = await resolveType(mapping.target, mapping.paidType);
      if (!leaveTypeId) { skippedNoType++; continue; } // --no-create-types and no match
    }

    // dedupe: same person + kind + span + type already imported?
    const existing = await prisma.leaveRequest.findFirst({
      where: {
        companyId: company!.id,
        employeeId: emp.id,
        kind: mapping.kind,
        leaveTypeId,
        startDate,
        endDate,
      },
      select: { id: true },
    });
    if (existing) { dupes++; continue; }

    toInsert++;
    const bucket = perEmployee.get(emp.fullName) ?? { leave: 0, wfh: 0 };
    if (mapping.kind === "WFH") bucket.wfh++; else bucket.leave++;
    perEmployee.set(emp.fullName, bucket);

    if (COMMIT) {
      // Recorded apply time, clamped to on-or-before the start date so these
      // historical entries never show the "Backdate" flag (which marks a request
      // applied AFTER its start date).
      const appliedRaw = parseAppliedAt(r[C.created] ?? "") ?? parseAppliedAt(r[C.applied] ?? "") ?? startDate;
      const appliedAt = appliedRaw > startDate ? startDate : appliedRaw;
      await prisma.leaveRequest.create({
        data: {
          companyId: company!.id,
          employeeId: emp.id,
          kind: mapping.kind,
          leaveTypeId,
          startDate,
          endDate,
          days,
          isHalfDay,
          halfDayPeriod: isHalfDay ? halfPeriod(reason) : null,
          reason: reason || null,
          status: "HR_APPROVED",
          decidedAt: appliedAt,
          createdAt: appliedAt,
        },
      });
      inserted++;
    }
  }

  // --- report ---
  console.log("Per-employee (to import):");
  [...perEmployee.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([n, b]) =>
    console.log(`  ${n.padEnd(22)} leave ${b.leave}, wfh ${b.wfh}`),
  );

  if (createdTypes.length) {
    console.log(`\nLeave types ${COMMIT ? "created" : "to create"}:`);
    createdTypes.forEach((t) => console.log(`  + ${t}`));
  }
  if (unknownNames.size) {
    console.log(`\nSkipped — not current Oprix employees:`);
    [...unknownNames.entries()].sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`  ${String(c).padStart(3)}  ${n}`));
  }
  if (unknownTypes.size) {
    console.log(`\nSkipped — unmapped request type (tell me how to map these):`);
    [...unknownTypes.entries()].forEach(([n, c]) => console.log(`  ${String(c).padStart(3)}  ${n}`));
  }

  console.log(`\nSummary:`);
  console.log(`  data rows            ${data.length}`);
  console.log(`  cancelled/skipped    ${cancelled}`);
  console.log(`  excluded (ex-emp)    ${excluded}`);
  console.log(`  bad/blank dates      ${badDate}`);
  console.log(`  no matching type     ${skippedNoType}`);
  console.log(`  already imported     ${dupes}`);
  console.log(`  ${COMMIT ? "INSERTED" : "would insert"}         ${COMMIT ? inserted : toInsert}`);
  if (!COMMIT) console.log(`\n(dry run — nothing written. Re-run with --commit to apply.)`);
}

// tiny helper: non-deleted company holidays as an ISO set within a range
async function holidaySetFor(companyId: string, start: Date, end: Date): Promise<Set<string>> {
  const hs = await prisma.holiday.findMany({
    where: { companyId, deletedAt: null, date: { gte: start, lte: end } },
    select: { date: true },
  });
  return new Set(hs.map((h) => h.date.toISOString().slice(0, 10)));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
