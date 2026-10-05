"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatISO, shiftISO, to12h, todayISO } from "@/lib/dates";
import { isWorkingDay } from "@/lib/leave/work-week";
import {
  computeDay,
  dayFlags,
  FLAG_LABELS,
  hhmm,
  hoursDec,
  hoursMin,
  parseDeviceStatus,
  toMin,
  type DayFigures,
  type DayFlag,
} from "@/lib/attendance/punches";
import type { PersonAttendance as PersonData } from "@/lib/attendance/records";

// The attendance tab on a person's profile.
//
// Every figure on this page is recomputed from the device's punch trail rather
// than read from its summary columns, because those columns disagree with the
// trail often enough to matter: on 23 days in the sample export the device said
// "Absent" for someone who scanned in and out, and its LateBy ignores the grace
// window the company actually operates. So both numbers are shown — ours and
// the device's — and the days where they part company are called out instead of
// being quietly reconciled.
//
// The date range is a URL parameter (it decides what the server loads); every
// other control filters what's already here, so they respond instantly.

type Bucket = "worked" | "half" | "rest-worked" | "absent" | "leave" | "holiday" | "off";

const BUCKETS: { key: Bucket; label: string; tone: "green" | "amber" | "blue" | "red" | "gray" }[] = [
  { key: "worked", label: "Worked", tone: "green" },
  { key: "half", label: "Half day", tone: "amber" },
  { key: "rest-worked", label: "Worked a day off", tone: "blue" },
  { key: "absent", label: "Absent", tone: "red" },
  { key: "leave", label: "On leave", tone: "blue" },
  { key: "holiday", label: "Holiday", tone: "gray" },
  { key: "off", label: "Weekly off", tone: "gray" },
];

const BUCKET_META = new Map(BUCKETS.map((b) => [b.key, b]));

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday-first, matching how the rest of Oprix draws a week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Row = {
  dateISO: string;
  dow: number;
  /** A day this person was expected in, per the company work week + holidays. */
  expected: boolean;
  holiday: string | null;
  leave: { typeName: string; half: boolean } | null;
  record: PersonData["days"][number] | null;
  figures: DayFigures;
  flags: DayFlag[];
  bucket: Bucket;
  /** What to show in a status cell. */
  label: string;
};

type SortKey = "date" | "in" | "out" | "hours" | "late";

export function PersonAttendance({
  data,
  people,
}: {
  data: PersonData;
  people: { value: string; label: string }[];
}) {
  const router = useRouter();
  const { employee, shift, from, to } = data;

  const shiftWindow = useMemo(
    () => ({
      startMin: toMin(shift.startTime),
      endMin: toMin(shift.endTime),
      graceMin: shift.graceMinutes,
    }),
    [shift.startTime, shift.endTime, shift.graceMinutes],
  );

  // ---- one Row per calendar day in the loaded window ----------------------
  const rows = useMemo<Row[]>(() => {
    const byDate = new Map(data.days.map((d) => [d.dateISO, d]));
    const holidays = new Map(data.holidays.map((h) => [h.dateISO, h.name]));
    const leaves = new Map(data.leaveDays.map((l) => [l.dateISO, l]));
    const holidaySet = new Set(holidays.keys());

    const out: Row[] = [];
    for (let d = from; d <= to; d = shiftISO(d, 1)) {
      const record = byDate.get(d) ?? null;
      const expected = isWorkingDay(d, data.workWeek, holidaySet);
      const figures = computeDay(record?.punchLog, { ...shiftWindow, expected });
      const flags = record
        ? dayFlags({
            figures,
            deviceStatus: record.deviceStatus,
            deviceWorkMin: record.deviceWorkMin,
          })
        : [];
      const holiday = holidays.get(d) ?? null;
      const leave = leaves.get(d) ?? null;
      const device = parseDeviceStatus(record?.deviceStatus);
      const scanned = figures.punches.length > 0;

      let bucket: Bucket;
      if (holiday) bucket = "holiday";
      else if (leave) bucket = "leave";
      else if (scanned && !expected) bucket = "rest-worked";
      else if (scanned && (device.kind === "half" || record?.type === "HALF_DAY")) bucket = "half";
      else if (scanned) bucket = "worked";
      else if (!expected) bucket = "off";
      else bucket = "absent";

      let label: string;
      if (bucket === "holiday") label = holiday ?? "Holiday";
      else if (bucket === "leave") label = leave?.half ? `${leave.typeName} (half)` : (leave?.typeName ?? "On leave");
      else if (bucket === "off") label = "Weekly off";
      else if (record?.manual) label = `${device.label || "Marked by hand"} · set by hand`;
      else label = device.label || (scanned ? "Present" : "Absent");

      out.push({ dateISO: d, dow: new Date(`${d}T00:00:00Z`).getUTCDay(), expected, holiday, leave, record, figures, flags, bucket, label });
    }
    return out;
  }, [data.days, data.holidays, data.leaveDays, data.workWeek, from, to, shiftWindow]);

  // ---- filters ------------------------------------------------------------
  const [buckets, setBuckets] = useState<Set<Bucket>>(new Set());
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [lateOver, setLateOver] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });
  const [picked, setPicked] = useState<string | null>(null);

  const lateThreshold = Number.isFinite(Number(lateOver)) && lateOver.trim() !== "" ? Math.max(0, Number(lateOver)) : null;
  const filtersOn = buckets.size > 0 || weekdays.size > 0 || lateThreshold !== null || onlyFlagged;

  const matches = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (buckets.size && !buckets.has(r.bucket)) continue;
      if (weekdays.size && !weekdays.has(r.dow)) continue;
      if (lateThreshold !== null && r.figures.lateMin <= lateThreshold) continue;
      if (onlyFlagged && r.flags.length === 0) continue;
      set.add(r.dateISO);
    }
    return set;
  }, [rows, buckets, weekdays, lateThreshold, onlyFlagged]);

  const kept = useMemo(() => rows.filter((r) => matches.has(r.dateISO)), [rows, matches]);

  // ---- summary over the kept days ----------------------------------------
  const facts = useMemo(() => {
    const worked = kept.filter((r) => r.figures.punches.length > 0);
    const totalMin = worked.reduce((s, r) => s + r.figures.spanMin, 0);
    const readable = worked.filter((r) => r.figures.coherent).length;
    const late = worked.filter((r) => r.figures.lateMin > 0);
    const lateMin = late.reduce((s, r) => s + r.figures.lateMin, 0);
    const arrivals = worked.map((r) => r.figures.firstIn!).sort((a, b) => a - b);
    const median = arrivals.length ? arrivals[Math.floor(arrivals.length / 2)] : null;
    return {
      workedDays: worked.length,
      expectedDays: kept.filter((r) => r.expected).length,
      totalMin,
      readable,
      avgMin: worked.length ? Math.round(totalMin / worked.length) : 0,
      median,
      lateDays: late.length,
      avgLate: late.length ? Math.round(lateMin / late.length) : 0,
      absences: kept.filter((r) => r.bucket === "absent").length,
      leaveDays: kept.filter((r) => r.bucket === "leave").length,
      restWorked: kept.filter((r) => r.bucket === "rest-worked").length,
      flagged: kept.filter((r) => r.flags.length > 0).length,
    };
  }, [kept]);

  // ---- the open day -------------------------------------------------------
  const byDate = useMemo(() => new Map(rows.map((r) => [r.dateISO, r])), [rows]);
  const fallbackDay = useMemo(() => {
    const scanned = [...rows].reverse().find((r) => r.figures.punches.length > 0);
    return scanned?.dateISO ?? rows[rows.length - 1]?.dateISO ?? null;
  }, [rows]);
  // Derived, not stored: when the person changes, `picked` points at a date that
  // isn't in the new window and we fall back without needing an effect.
  const openDate = picked && byDate.has(picked) ? picked : fallbackDay;
  const open = openDate ? (byDate.get(openDate) ?? null) : null;

  const log = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    const val = (r: Row) => {
      switch (sort.key) {
        case "in":
          return r.figures.firstIn ?? -1;
        case "out":
          return r.figures.lastOut ?? -1;
        case "hours":
          return r.figures.spanMin;
        case "late":
          return r.figures.lateMin;
        default:
          return 0;
      }
    };
    return [...kept].sort((a, b) =>
      sort.key === "date" ? dir * a.dateISO.localeCompare(b.dateISO) : dir * (val(a) - val(b)) || a.dateISO.localeCompare(b.dateISO),
    );
  }, [kept, sort]);

  const reset = () => {
    setBuckets(new Set());
    setWeekdays(new Set());
    setLateOver("");
    setOnlyFlagged(false);
  };

  const graceNote = shift.startTime
    ? `${shift.startTime}${shift.graceMinutes ? ` + ${shift.graceMinutes} min grace` : " · no grace set"}`
    : "No work shift assigned";
  // Worth saying out loud: the figures are real, but they rest on a company-wide
  // fallback rather than anything decided about this person.
  const shiftSource = shift.fromDefault ? " (company default)" : "";

  return (
    <div className="space-y-6">
      {/* ---- who, and the window ------------------------------------------ */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <Field label="Viewing" className="min-w-56">
            <Combobox
              options={people}
              value={employee.id}
              onChange={(id) => id && id !== employee.id && router.push(`/employees/${id}/attendance`)}
              searchPlaceholder="Find a person…"
            />
          </Field>
          <PeriodPicker from={from} to={to} covered={data.importedRange} />
          <div className="ml-auto text-right text-xs text-muted">
            <p>
              {shift.startTime ? (
                <>
                  Lateness measured from <span className="font-medium text-content">{graceNote}</span>
                  {shiftSource}
                </>
              ) : (
                <span className="font-medium text-amber-600 dark:text-amber-400">Lateness not measured — no work shift</span>
              )}
            </p>
            <p className="mt-0.5">
              {employee.machineCode
                ? `Device code ${employee.machineCode}`
                : "No device code mapped — nothing will import for this person"}
            </p>
          </div>
        </CardBody>
      </Card>

      {!shift.startTime && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3">
            <Badge tone="amber">No work shift</Badge>
            <p className="min-w-0 flex-1 text-sm text-muted">
              {employee.name}{" "}has no work shift assigned, so lateness isn&apos;t measured anywhere on this page — the
              hours and scan times below are still accurate. Assign one on their employee record and the figures fill in
              on the next page load.
            </p>
            <a href={`/employees/${employee.id}/edit`} className="text-sm font-medium text-accent-strong hover:underline">
              Assign a shift →
            </a>
          </CardBody>
        </Card>
      )}

      {data.days.length === 0 ? (
        <Card>
          <CardBody className="py-14 text-center">
            <p className="text-sm text-muted">
              No attendance has been imported for {employee.name} between {formatISO(from)} and {formatISO(to)}.
            </p>
            <a href="/attendance/import" className="mt-3 inline-block text-sm font-medium text-accent-strong hover:underline">
              Import a device report →
            </a>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* ---- filters --------------------------------------------------- */}
          <Card>
            <CardBody className="space-y-4">
              <ChipRow label="Status">
                {BUCKETS.map((b) => (
                  <Chip
                    key={b.key}
                    on={buckets.has(b.key)}
                    onClick={() => setBuckets(toggled(buckets, b.key))}
                    count={rows.filter((r) => r.bucket === b.key).length}
                  >
                    {b.label}
                  </Chip>
                ))}
              </ChipRow>
              <ChipRow label="Weekday">
                {WEEK_ORDER.map((d) => (
                  <Chip key={d} on={weekdays.has(d)} onClick={() => setWeekdays(toggled(weekdays, d))}>
                    {DOW_LABELS[d]}
                  </Chip>
                ))}
              </ChipRow>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                <Field label="Late by more than" htmlFor="att-late" className="w-44" hint="minutes, past grace">
                  <Input
                    id="att-late"
                    type="number"
                    min={0}
                    step={5}
                    value={lateOver}
                    onChange={(e) => setLateOver(e.target.value)}
                    placeholder="any"
                  />
                </Field>
                <Chip on={onlyFlagged} onClick={() => setOnlyFlagged(!onlyFlagged)} count={rows.filter((r) => r.flags.length > 0).length}>
                  Needs a decision
                </Chip>
                <div className="ml-auto flex items-center gap-3 text-xs text-muted">
                  <span>
                    {kept.length} of {rows.length} days shown
                  </span>
                  {filtersOn && (
                    <Button variant="secondary" size="sm" onClick={reset}>
                      Reset filters
                    </Button>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* ---- the numbers --------------------------------------------- */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Tile label="Days worked" value={String(facts.workedDays)} note={`of ${facts.expectedDays} expected`} />
            <Tile label="Hours on site" value={hoursMin(facts.totalMin)} note="first scan to last, per day" />
            <Tile label="Average day" value={hoursMin(facts.avgMin)} note={`${facts.readable} of ${facts.workedDays} days pair in/out cleanly`} />
            <Tile label="Typical arrival" value={facts.median === null ? "—" : to12h(hhmm(facts.median))} note="median first scan" />
            <Tile
              label="Late arrivals"
              // Never a 0 without a shift: that would read as "always on time"
              // when the truth is that nothing was measured.
              value={shift.startTime ? String(facts.lateDays) : "not measured"}
              note={shift.startTime ? `after ${graceNote}` : "assign a work shift to get this"}
              accent={
                !shift.startTime
                  ? "text-amber-600 dark:text-amber-400"
                  : facts.lateDays > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : undefined
              }
            />
            <Tile
              label="Average lateness"
              value={!shift.startTime ? "—" : facts.avgLate ? hoursMin(facts.avgLate) : "—"}
              note={shift.startTime ? "on the late days" : "no shift start to measure from"}
            />
            <Tile
              label="Absences"
              value={String(facts.absences)}
              note={`${facts.leaveDays} on approved leave`}
              accent={facts.absences > 0 ? "text-red-600 dark:text-red-400" : undefined}
            />
            <Tile
              label="Needs a decision"
              value={String(facts.flagged)}
              note={facts.restWorked ? `${facts.restWorked} worked a day off` : "device vs. punch trail"}
              accent={facts.flagged > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
            />
          </div>

          {/* ---- calendar ------------------------------------------------- */}
          <Card>
            <CardHeader
              title="Day by day"
              description="Hours are first scan to last. A dot marks a day where the device's own figures don't hold up."
            />
            <CardBody>
              <MonthGrid rows={rows} matches={matches} dimUnmatched={filtersOn} openDate={openDate} onPick={setPicked} />
            </CardBody>
          </Card>

          {/* ---- the open day -------------------------------------------- */}
          {open && <DayDetail row={open} shift={shift} shiftWindow={shiftWindow} />}

          {/* ---- charts --------------------------------------------------- */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="When they arrive" description="Each scanned day's first punch against the shift line." />
              <CardBody>
                <ArrivalChart rows={kept} shiftWindow={shiftWindow} onPick={setPicked} openDate={openDate} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Hours per day" description="First scan to last, per day." />
              <CardBody>
                <HoursChart rows={kept} onPick={setPicked} openDate={openDate} />
              </CardBody>
            </Card>
          </div>

          {/* ---- log ------------------------------------------------------ */}
          <Card className="overflow-hidden">
            <CardHeader title="Day log" description={`${log.length} ${log.length === 1 ? "day" : "days"} · click a row to open it above`} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                    <SortTh col="date" sort={sort} onSort={setSort}>Date</SortTh>
                    <SortTh col="in" sort={sort} onSort={setSort}>First in</SortTh>
                    <SortTh col="out" sort={sort} onSort={setSort}>Last out</SortTh>
                    <SortTh col="hours" sort={sort} onSort={setSort}>Hours</SortTh>
                    <SortTh col="late" sort={sort} onSort={setSort}>Late</SortTh>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Device said</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {log.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                        No days match these filters.
                      </td>
                    </tr>
                  )}
                  {log.map((r) => {
                    const meta = BUCKET_META.get(r.bucket)!;
                    return (
                      <tr
                        key={r.dateISO}
                        onClick={() => setPicked(r.dateISO)}
                        className={cn(
                          "cursor-pointer hover:bg-canvas",
                          r.dateISO === openDate && "bg-accent-soft hover:bg-accent-soft",
                        )}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap font-medium text-content">
                          {formatISO(r.dateISO)}
                          {r.flags.length > 0 && <span className="ml-2 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-muted">{r.figures.firstIn === null ? "—" : hhmm(r.figures.firstIn)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-muted">{r.figures.lastOut === null ? "—" : hhmm(r.figures.lastOut)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-muted">{r.figures.punches.length ? hoursMin(r.figures.spanMin) : "—"}</td>
                        <td className={cn("px-4 py-2.5 tabular-nums", r.figures.lateMin > 0 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted")}>
                          {!shift.startTime && r.figures.firstIn !== null ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400">no shift</span>
                          ) : r.figures.lateMin > 0 ? (
                            hoursMin(r.figures.lateMin)
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-4 py-2.5 text-xs text-muted">{r.record ? r.label : "not imported"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-xs leading-relaxed text-faint">
            Figures are recomputed from each day&apos;s punch trail, not copied from the device&apos;s summary columns —
            those columns report no hours on days the trail clearly shows someone was in, and their lateness ignores
            the grace window set on the work shift. Where the two disagree, both are shown.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/** Presets write the same `from`/`to` the pickers do: the range is a URL param
 *  because it decides what the server loads, not just what's shown. */
function PeriodPicker({
  from,
  to,
  covered,
}: {
  from: string;
  to: string;
  covered: { from: string; to: string } | null;
}) {
  const router = useRouter();
  const today = todayISO();
  const go = (f: string, t: string) => router.push(`?from=${f}&to=${t}`);

  const presets: { value: string; label: string; range: () => [string, string] }[] = [
    { value: "all", label: "Everything imported", range: () => [covered?.from ?? shiftISO(today, -30), minISO(covered?.to ?? today, today)] },
    { value: "month", label: "This month", range: () => [`${today.slice(0, 7)}-01`, today] },
    { value: "prev", label: "Last month", range: () => previousMonth(today) },
    { value: "30", label: "Last 30 days", range: () => [shiftISO(today, -29), today] },
    { value: "7", label: "Last 7 days", range: () => [shiftISO(today, -6), today] },
  ];
  const active = presets.find((p) => {
    const [f, t] = p.range();
    return f === from && t === to;
  });

  return (
    <>
      <Field label="Period" className="min-w-48">
        <Combobox
          options={presets.map((p) => ({ value: p.value, label: p.label }))}
          value={active?.value ?? ""}
          onChange={(v) => {
            const p = presets.find((x) => x.value === v);
            if (p) {
              const [f, t] = p.range();
              go(f, t);
            }
          }}
          placeholder="Custom range"
          leadingIcon="calendarDays"
        />
      </Field>
      <Field label="From" className="w-40">
        <DatePicker value={from} onChange={(v) => v && go(v, maxISO(v, to))} />
      </Field>
      <Field label="To" className="w-40">
        <DatePicker value={to} onChange={(v) => v && go(minISO(from, v), v)} />
      </Field>
    </>
  );
}

const minISO = (a: string, b: string) => (a < b ? a : b);
const maxISO = (a: string, b: string) => (a > b ? a : b);

function previousMonth(today: string): [string, string] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const mm = String(pm).padStart(2, "0");
  return [`${py}-${mm}-01`, `${py}-${mm}-${String(last).padStart(2, "0")}`];
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wider text-faint">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  count,
  children,
}: {
  on: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
        on
          ? "bg-brand-600 text-white ring-brand-600"
          : "bg-canvas text-muted ring-line-strong hover:text-content hover:ring-brand-400",
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn("tabular-nums", on ? "text-white/70" : "text-faint")}>{count}</span>
      )}
    </button>
  );
}

function Tile({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-surface px-3.5 py-3 ring-1 ring-inset ring-line">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold leading-none", accent ?? "text-content")}>{value}</p>
      {note && <p className="mt-1.5 text-[11px] leading-tight text-faint">{note}</p>}
    </div>
  );
}

function SortTh({
  col,
  sort,
  onSort,
  children,
}: {
  col: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (s: { key: SortKey; desc: boolean }) => void;
  children: React.ReactNode;
}) {
  const on = sort.key === col;
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort({ key: col, desc: on ? !sort.desc : true })}
        className={cn("inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-content", on && "text-content")}
      >
        {children}
        {on && <Icon name="chevronDown" className={cn("size-3", !sort.desc && "rotate-180")} />}
      </button>
    </th>
  );
}

// ---- calendar -------------------------------------------------------------

function MonthGrid({
  rows,
  matches,
  dimUnmatched,
  openDate,
  onPick,
}: {
  rows: Row[];
  matches: Set<string>;
  dimUnmatched: boolean;
  openDate: string | null;
  onPick: (d: string) => void;
}) {
  const months = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.dateISO.slice(0, 7);
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return [...map];
  }, [rows]);

  return (
    <div className="space-y-6">
      {months.map(([month, days]) => {
        // Pad to the Monday on or before the 1st so columns line up week to week.
        const firstDow = new Date(`${days[0].dateISO}T00:00:00Z`).getUTCDay();
        const pad = WEEK_ORDER.indexOf(firstDow);
        return (
          <div key={month}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{monthLabel(month)}</p>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_ORDER.map((d) => (
                <div key={d} className="pb-1 text-center text-[11px] font-medium text-faint">{DOW_LABELS[d]}</div>
              ))}
              {Array.from({ length: pad }, (_, i) => <div key={`pad-${i}`} />)}
              {days.map((r) => (
                <DayCell
                  key={r.dateISO}
                  row={r}
                  dim={dimUnmatched && !matches.has(r.dateISO)}
                  open={r.dateISO === openDate}
                  onPick={onPick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CELL_TONE: Record<Bucket, string> = {
  worked: "bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25",
  half: "bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/25",
  "rest-worked": "bg-brand-50 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/25",
  absent: "bg-red-50 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/25",
  leave: "bg-brand-50 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/25",
  holiday: "bg-canvas ring-line",
  off: "bg-canvas ring-line",
};

function DayCell({ row, dim, open, onPick }: { row: Row; dim: boolean; open: boolean; onPick: (d: string) => void }) {
  const worked = row.figures.punches.length > 0;
  return (
    <button
      type="button"
      onClick={() => onPick(row.dateISO)}
      title={`${formatISO(row.dateISO)} — ${row.label}`}
      className={cn(
        "relative flex h-16 flex-col items-start justify-between rounded-lg px-2 py-1.5 text-left ring-1 ring-inset transition-all",
        CELL_TONE[row.bucket],
        dim && "opacity-35",
        open && "ring-2 ring-brand-500",
        "hover:ring-brand-400",
      )}
    >
      <span className="text-[11px] font-semibold text-content">{Number(row.dateISO.slice(8, 10))}</span>
      {worked ? (
        <span className="text-[11px] leading-tight text-muted">
          <span className="font-medium text-content">{hoursDec(row.figures.spanMin)}h</span>
          {row.figures.lateMin > 0 && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">+{row.figures.lateMin}m</span>
          )}
        </span>
      ) : (
        <span className="text-[10px] leading-tight text-faint">
          {row.bucket === "off" ? "off" : row.bucket === "holiday" ? "holiday" : row.bucket === "leave" ? "leave" : "absent"}
        </span>
      )}
      {row.flags.length > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-amber-500" />}
    </button>
  );
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ---- one day -------------------------------------------------------------

const TRACK_FROM = 6 * 60;
const TRACK_TO = 23 * 60;

function DayDetail({
  row,
  shift,
  shiftWindow,
}: {
  row: Row;
  shift: PersonData["shift"];
  shiftWindow: { startMin: number | null; endMin: number | null; graceMin: number };
}) {
  const f = row.figures;
  const device = parseDeviceStatus(row.record?.deviceStatus);
  const meta = BUCKET_META.get(row.bucket)!;

  // Widen the track if someone punched outside the default 06:00–23:00 band.
  const lo = Math.min(TRACK_FROM, f.firstIn ?? TRACK_FROM, shiftWindow.startMin ?? TRACK_FROM) - 15;
  const hi = Math.max(TRACK_TO, f.lastOut ?? TRACK_TO, shiftWindow.endMin ?? TRACK_TO) + 15;
  const pct = (min: number) => ((min - lo) / (hi - lo)) * 100;

  const facts: { label: string; value: string; tone?: string }[] = [
    { label: "In", value: f.firstIn === null ? "—" : to12h(hhmm(f.firstIn)) },
    { label: "Out", value: f.lastOut === null ? "—" : to12h(hhmm(f.lastOut)) },
    { label: "Hours", value: f.punches.length ? hoursMin(f.spanMin) : "—" },
    {
      label: "Late",
      value:
        shiftWindow.startMin === null
          ? "no shift set"
          : f.lateMin > 0
            ? hoursMin(f.lateMin)
            : f.firstIn === null
              ? "—"
              : "on time",
      tone:
        shiftWindow.startMin === null || f.lateMin > 0 ? "text-amber-600 dark:text-amber-400" : undefined,
    },
    { label: "Left early", value: f.earlyMin > 0 ? hoursMin(f.earlyMin) : "—" },
    { label: "Scans", value: String(f.punches.length) },
  ];
  // Shown only when the scans pair cleanly AND there is a real gap. On the other
  // days it was two permanent "can't read" cells, and on a straight two-scan day
  // it just repeated the hours back — neither told anyone anything.
  if (f.awayMin !== null && f.awayMin > 0) {
    facts.push({ label: "Away mid-day", value: hoursMin(f.awayMin) });
  }

  const deviceFacts: { label: string; value: string }[] = [
    { label: "Status", value: device.label || "—" },
    { label: "In / out", value: [row.record?.deviceIn, row.record?.deviceOut].filter(Boolean).join(" – ") || "—" },
    { label: "Work duration", value: row.record?.deviceWorkMin != null ? hoursMin(row.record.deviceWorkMin) : "—" },
    { label: "Late by", value: row.record?.deviceLateMin ? hoursMin(row.record.deviceLateMin) : "0" },
    { label: "Shift", value: row.record?.shiftCode || "—" },
  ];

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {formatISO(row.dateISO)}
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {row.record?.manual && <Badge tone="amber">Marked by hand</Badge>}
            {!row.record && <Badge tone="gray">Not imported</Badge>}
          </span>
        }
        description={
          shift.startTime
            ? `Shift ${shift.name ? `${shift.name} ` : ""}${shift.startTime}–${shift.endTime}${shift.graceMinutes ? `, ${shift.graceMinutes} min grace` : ""}${shift.fromDefault ? " (company default)" : ""}`
            : "No work shift assigned, so lateness can't be measured"
        }
      />
      <CardBody className="space-y-5">
        {/* The day on a clock. One bar from the first scan to the last, with a
            dot per scan — not split into in/out stretches, because the device's
            direction labels only pair up on about half the days and splitting on
            them invents breaks that weren't there. */}
        <div>
          <div className="relative">
            {/* hour labels, positioned along the track */}
            <div className="relative h-4">
              {axisHours(lo, hi).map((h) => (
                <span
                  key={h}
                  className="absolute -translate-x-1/2 text-[11px] tabular-nums text-faint"
                  style={{ left: `${pct(h)}%` }}
                >
                  {clockLabel(h)}
                </span>
              ))}
            </div>

            <div className="relative h-12 rounded-xl bg-canvas ring-1 ring-inset ring-line">
              {/* the shift, as one labelled band */}
              {shiftWindow.startMin !== null && shiftWindow.endMin !== null && (
                <div
                  className="absolute inset-y-0 border-x border-brand-500/40 bg-brand-500/[0.06]"
                  style={{
                    left: `${pct(shiftWindow.startMin)}%`,
                    width: `${pct(shiftWindow.endMin) - pct(shiftWindow.startMin)}%`,
                  }}
                  title={`Shift ${hhmm(shiftWindow.startMin)} – ${hhmm(shiftWindow.endMin)}`}
                />
              )}
              {/* the late stretch: from the end of grace to when they arrived */}
              {shiftWindow.startMin !== null && f.lateMin > 0 && f.firstIn !== null && (
                <div
                  className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-l-full bg-amber-400/70"
                  style={{
                    left: `${pct(shiftWindow.startMin + shiftWindow.graceMin)}%`,
                    width: `${Math.max(0.3, pct(f.firstIn) - pct(shiftWindow.startMin + shiftWindow.graceMin))}%`,
                  }}
                  title={`${hoursMin(f.lateMin)} late`}
                />
              )}
              {/* the day itself */}
              {f.firstIn !== null && f.lastOut !== null && (
                <div
                  className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-emerald-500"
                  style={{ left: `${pct(f.firstIn)}%`, width: `${Math.max(0.4, pct(f.lastOut) - pct(f.firstIn))}%` }}
                  title={`${hhmm(f.firstIn)} – ${hhmm(f.lastOut)}`}
                />
              )}
              {f.punches.map((p, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 ring-1 ring-emerald-700/40"
                  style={{ left: `${pct(p.min)}%` }}
                  title={`Scan at ${to12h(hhmm(p.min))}`}
                />
              ))}
              {f.punches.length === 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-faint">
                  No scans on this day
                </span>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
            {f.firstIn !== null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full bg-emerald-500" />
                In {to12h(hhmm(f.firstIn))} → out {to12h(hhmm(f.lastOut!))}
                <span className="text-faint">· {f.punches.length} scans</span>
              </span>
            )}
            {f.lateMin > 0 && (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-1.5 w-4 rounded-full bg-amber-400" />
                {hoursMin(f.lateMin)} late
              </span>
            )}
            {shiftWindow.startMin !== null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm border-x border-brand-500/40 bg-brand-500/[0.12]" />
                Shift {to12h(hhmm(shiftWindow.startMin))} – {to12h(hhmm(shiftWindow.endMin!))}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {facts.map((d) => (
            <div key={d.label}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{d.label}</p>
              <p className={cn("mt-0.5 text-sm font-medium", d.tone ?? "text-content")}>{d.value}</p>
            </div>
          ))}
        </div>

        {row.flags.length > 0 && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/25">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Needs a decision</p>
            <ul className="mt-1.5 space-y-1 text-sm text-amber-800 dark:text-amber-200">
              {row.flags.map((flag) => (
                <li key={flag}>· {FLAG_LABELS[flag]}</li>
              ))}
            </ul>
          </div>
        )}

        {row.leave && (
          <p className="text-sm text-muted">
            Approved <span className="font-medium text-content">{row.leave.typeName}</span>
            {row.leave.half ? " (half day)" : ""} covers this date.
          </p>
        )}

        {row.record && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">What the device recorded</p>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-5">
              {deviceFacts.map((d) => (
                <div key={d.label}>
                  <p className="text-[11px] text-faint">{d.label}</p>
                  <p className="mt-0.5 text-sm text-content">{d.value}</p>
                </div>
              ))}
            </div>
            {row.record.punchLog && (
              <p className="mt-3 break-all rounded-lg bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed text-muted ring-1 ring-inset ring-line">
                {row.record.punchLog}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Hour marks across the track — every 3 hours, so the labels can be words. */
function axisHours(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let h = Math.ceil(lo / 180) * 180; h <= hi; h += 180) out.push(h);
  return out;
}

/** 540 → "9am", 720 → "12pm". Short enough to sit under a tick. */
function clockLabel(min: number): string {
  const h = Math.floor((min % 1440) / 60);
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

// ---- charts -------------------------------------------------------------

const CHART_H = 160;

function ArrivalChart({
  rows,
  shiftWindow,
  onPick,
  openDate,
}: {
  rows: Row[];
  shiftWindow: { startMin: number | null; graceMin: number };
  onPick: (d: string) => void;
  openDate: string | null;
}) {
  const points = rows.filter((r) => r.figures.firstIn !== null);
  if (points.length === 0) return <p className="py-10 text-center text-sm text-muted">No arrivals in this selection.</p>;

  const start = shiftWindow.startMin;
  // Scaled to the quartiles rather than the full spread: two 04:30 scans in a
  // month otherwise squash every ordinary morning into a band a few pixels tall.
  // The usual 1.5×IQR fence, which survives more than one outlier where a
  // percentile cut doesn't. Outliers are still drawn — pinned to the edge and
  // ringed, so they can't be misread as sitting at the boundary time.
  const sorted = [...points.map((r) => r.figures.firstIn!)].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const q1 = at(0.25);
  const q3 = at(0.75);
  const fence = Math.max(30, (q3 - q1) * 1.5);
  const lo = Math.min(Math.max(sorted[0], q1 - fence), start ?? Infinity) - 20;
  const hi = Math.max(Math.min(sorted[sorted.length - 1], q3 + fence), (start ?? 0) + shiftWindow.graceMin) + 20;
  // The clock runs downwards, so the earliest arrival sits at the top and a late
  // one hangs below the shift line — the direction people read lateness in.
  const top = (min: number) => ((Math.min(hi, Math.max(lo, min)) - lo) / (hi - lo)) * 100;

  return (
    <div className="space-y-2">
      <div className="relative h-40 rounded-xl bg-canvas ring-1 ring-inset ring-line">
        {start !== null && (
          <>
            {shiftWindow.graceMin > 0 && (
              <div
                className="absolute inset-x-0 bg-amber-400/15"
                style={{ top: `${top(start)}%`, height: `${top(start + shiftWindow.graceMin) - top(start)}%` }}
              />
            )}
            <div className="absolute inset-x-0 h-px bg-brand-500/70" style={{ top: `${top(start)}%` }} />
          </>
        )}
        {points.map((r, i) => {
          const x = points.length > 1 ? (i / (points.length - 1)) * 100 : 50;
          const arrival = r.figures.firstIn!;
          const late = r.figures.lateMin > 0;
          const clipped = arrival < lo || arrival > hi;
          return (
            <button
              key={r.dateISO}
              type="button"
              onClick={() => onPick(r.dateISO)}
              title={`${formatISO(r.dateISO)} — in at ${hhmm(arrival)}${late ? `, ${r.figures.lateMin} min late` : ""}${clipped ? " (off the scale)" : ""}`}
              aria-label={`${formatISO(r.dateISO)}, arrived ${hhmm(arrival)}`}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-150",
                r.dateISO === openDate ? "size-3 ring-2 ring-brand-500" : "size-2",
                clipped && r.dateISO !== openDate && "ring-2 ring-content/40",
                late ? "bg-amber-500" : "bg-emerald-500",
              )}
              style={{ left: `calc(${x}% * 0.92 + 4%)`, top: `${top(arrival)}%` }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-faint">
        <span>
          {hhmm(lo)} at the top · {hhmm(hi)} at the bottom
          {points.some((r) => r.figures.firstIn! < lo || r.figures.firstIn! > hi) && " · ringed dots fall outside it"}
        </span>
        {start !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 bg-brand-500/70" /> shift start {hhmm(start)}
            {shiftWindow.graceMin > 0 && <span className="text-faint">+ {shiftWindow.graceMin}m grace</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function HoursChart({ rows, onPick, openDate }: { rows: Row[]; onPick: (d: string) => void; openDate: string | null }) {
  const bars = rows.filter((r) => r.figures.punches.length > 0);
  if (bars.length === 0) return <p className="py-10 text-center text-sm text-muted">No scanned days in this selection.</p>;
  const max = Math.max(...bars.map((r) => r.figures.spanMin), 9 * 60);
  const width = 100 / bars.length;

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" className="h-40 w-full">
        <line x1={0} x2={100} y1={CHART_H - (540 / max) * CHART_H} y2={CHART_H - (540 / max) * CHART_H} stroke="rgb(99 102 241 / 0.5)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        {bars.map((r, i) => {
          const h = (r.figures.spanMin / max) * CHART_H;
          return (
            <rect
              key={r.dateISO}
              x={i * width + width * 0.15}
              y={CHART_H - h}
              width={width * 0.7}
              height={h}
              rx={0.6}
              className="cursor-pointer"
              fill={r.dateISO === openDate ? "rgb(79 70 229)" : r.figures.spanMin < 480 ? "rgb(245 158 11 / 0.75)" : "rgb(16 185 129 / 0.8)"}
              onClick={() => onPick(r.dateISO)}
            >
              <title>{`${formatISO(r.dateISO)} — ${hoursMin(r.figures.spanMin)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-faint">
        <span>Peak {hoursMin(max)}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-brand-500/60" /> 9h
        </span>
      </div>
    </div>
  );
}
