import type { TaskStatus } from "@prisma/client";

/**
 * Reading an Airtable task export (the "Download CSV" of a grid view) into
 * plain task records. Pure — no database — so it can be checked on its own.
 *
 * Airtable writes dates the way the person downloading sees them ("Local"
 * format follows their browser), so 09/03/2026 may be the 9th of March or the
 * 3rd of September. The order is worked out from the file itself: any first
 * number over 12 means day-first, any second number over 12 means
 * month-first. A file that never settles it is refused rather than guessed.
 */

export type AirtableAsset = { name: string; url: string };

export type AirtableTask = {
  /** The Task ID column, e.g. "Tech - 8129" — what a re-import matches on. */
  ref: string;
  name: string;
  type: string | null;
  department: string | null;
  description: string;
  notes: string;
  clientComment: string;
  /** Status Update, as written in Airtable. */
  status: string;
  finalLink: string | null;
  createdOn: Date | null;
  clientDeadline: Date | null;
  deliveredOn: Date | null;
  client: string;
  assets: AirtableAsset[];
};

export type DateOrder = "DMY" | "MDY" | "YMD";

// ---- CSV -----------------------------------------------------------------------

/** RFC 4180: quoted fields may hold commas, newlines and "" for a quote. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---- Columns -------------------------------------------------------------------

const COLUMNS = {
  ref: "task id",
  name: "task",
  type: "type of task",
  description: "description",
  assets: "assets",
  notes: "notes",
  status: "status update",
  finalLink: "final link",
  deliveredOn: "delivered on",
  client: "client",
  createdOn: "date of task creation",
  clientDeadline: "client deadline",
  department: "department",
  clientComment: "comment from client",
} as const;
type Key = keyof typeof COLUMNS;

// ---- Dates -----------------------------------------------------------------------

type DateParts = { a: number; b: number; c: number; h: number; mi: number; hasTime: boolean; ymd: boolean };

function splitDate(raw: string): DateParts | null {
  const m = raw
    .trim()
    .match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?$/i);
  if (!m) return null;
  const [, p1, p2, p3, hh, mm, ampm] = m;
  let h = hh ? Number(hh) : 0;
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith("p");
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return {
    a: Number(p1),
    b: Number(p2),
    c: Number(p3),
    h,
    mi: mm ? Number(mm) : 0,
    hasTime: !!hh,
    ymd: p1.length === 4,
  };
}

/** The day/month order a set of date cells implies, or why it can't be told. */
export function detectDateOrder(cells: string[]): { order: DateOrder } | { error: string } {
  let dayFirst = false;
  let monthFirst = false;
  let any = false;
  for (const cell of cells) {
    if (!cell.trim()) continue;
    const p = splitDate(cell);
    if (!p) return { error: `Couldn't read the date “${cell.trim()}”.` };
    any = true;
    if (p.ymd) continue;
    if (p.a > 12) dayFirst = true;
    if (p.b > 12) monthFirst = true;
  }
  if (dayFirst && monthFirst) return { error: "The dates mix day-first and month-first formats." };
  if (dayFirst) return { order: "DMY" };
  if (monthFirst) return { order: "MDY" };
  if (!any) return { order: "YMD" };
  // Every day was 12 or under — only possible for a handful of rows. ISO-only
  // files land above; anything else can't be told apart safely.
  const allIso = cells.every((c) => !c.trim() || splitDate(c)?.ymd);
  return allIso ? { order: "YMD" } : { error: "Couldn't tell the day from the month in the dates." };
}

/** Offset of a time zone from UTC at a moment, in ms (IST → +5:30). */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - at.getTime();
}

/**
 * A cell as a Date. Date-only cells become midnight UTC of that day — how the
 * app stores calendar dates. Cells with a time are wall-clock time in
 * `timeZone` (Airtable shows them in the downloader's zone).
 */
export function parseDateCell(raw: string, order: DateOrder, timeZone: string): Date | null {
  if (!raw.trim()) return null;
  const p = splitDate(raw);
  if (!p) return null;
  const [y, mo, d] =
    p.ymd || order === "YMD" ? [p.a, p.b, p.c] : order === "DMY" ? [p.c, p.b, p.a] : [p.c, p.a, p.b];
  const year = y < 100 ? 2000 + y : y;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (!p.hasTime) return new Date(Date.UTC(year, mo - 1, d));
  const wall = Date.UTC(year, mo - 1, d, p.h, p.mi);
  return new Date(wall - zoneOffsetMs(timeZone, new Date(wall)));
}

// ---- Cells -----------------------------------------------------------------------

/** "shot.png (https://…),brief.pdf (https://…)" → [{ name, url }]. */
export function parseAssets(raw: string): AirtableAsset[] {
  const out: AirtableAsset[] = [];
  const re = /(?:^|,\s*)(.+?)\s\((https?:\/\/[^\s)]+)\)/g;
  for (const m of raw.matchAll(re)) out.push({ name: m[1].trim(), url: m[2] });
  return out;
}

const STATUS_MAP: Record<string, TaskStatus> = {
  "done & delivered": "COMPLETED",
  "done and delivered": "COMPLETED",
  done: "COMPLETED",
  delivered: "COMPLETED",
  completed: "COMPLETED",
  "awaiting for bm feedback": "REVIEW",
  "awaiting bm feedback": "REVIEW",
  "task assigned": "TODO",
  "to do": "TODO",
  todo: "TODO",
  "not started": "TODO",
  "in progress": "IN_PROGRESS",
  "on hold": "HOLD",
};

/** Airtable's Status Update → the app's status; unknown wording stays To Do. */
export function mapStatus(raw: string): { status: TaskStatus; known: boolean } {
  const s = STATUS_MAP[raw.trim().toLowerCase()];
  return s ? { status: s, known: true } : { status: "TODO", known: false };
}

/** "Website: New Page/Post Design" → "New Page/Post Design" (the app's task type names). */
export function typeName(raw: string): string {
  const i = raw.indexOf(":");
  return (i >= 0 ? raw.slice(i + 1) : raw).trim();
}

// ---- The whole file ----------------------------------------------------------------

export type ReadResult =
  | { ok: true; tasks: AirtableTask[]; order: DateOrder; headers: string[] }
  | { ok: false; error: string };

export function readAirtableTasks(csv: string, timeZone: string): ReadResult {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { ok: false, error: "The file has no rows." };
  const headers = rows[0].map((h) => h.trim());
  const index = new Map(headers.map((h, i) => [h.toLowerCase(), i]));
  const col = {} as Record<Key, number | undefined>;
  for (const [key, name] of Object.entries(COLUMNS) as [Key, string][]) col[key] = index.get(name);
  if (col.ref === undefined || col.name === undefined) {
    return { ok: false, error: "This doesn't look like the Airtable task export — it needs “Task ID” and “Task” columns." };
  }
  const cell = (r: string[], k: Key) => (col[k] === undefined ? "" : (r[col[k]!] ?? "")).trim();

  const body = rows.slice(1);
  const dateCells = body.flatMap((r) => [cell(r, "createdOn"), cell(r, "clientDeadline"), cell(r, "deliveredOn")]);
  const detected = detectDateOrder(dateCells);
  if ("error" in detected) return { ok: false, error: detected.error };
  const order = detected.order;

  const tasks: AirtableTask[] = [];
  for (const r of body) {
    const ref = cell(r, "ref");
    const name = cell(r, "name");
    if (!ref && !name) continue;
    tasks.push({
      ref,
      name,
      type: cell(r, "type") || null,
      department: cell(r, "department") || null,
      description: cell(r, "description"),
      notes: cell(r, "notes"),
      clientComment: cell(r, "clientComment"),
      status: cell(r, "status"),
      finalLink: cell(r, "finalLink") || null,
      createdOn: parseDateCell(cell(r, "createdOn"), order, timeZone),
      clientDeadline: parseDateCell(cell(r, "clientDeadline"), order, timeZone),
      deliveredOn: parseDateCell(cell(r, "deliveredOn"), order, timeZone),
      client: cell(r, "client"),
      assets: parseAssets(cell(r, "assets")),
    });
  }
  return { ok: true, tasks, order, headers };
}
