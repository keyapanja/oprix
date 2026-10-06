"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  breakRuleText,
  computeDay,
  dayFlags,
  FLAG_LABELS,
  hhmm,
  hoursDec,
  hoursMin,
  parseDeviceStatus,
  readBreaks,
  realScans,
  toMin,
  type BreakReading,
  type Punch,
  type BreakRule,
  type DayFigures,
  type DayFlag,
} from "@/lib/attendance/punches";
import {
  standardMin,
  timingLengthMin,
  timingOn,
  windowOf,
  WEEKDAY_NAMES,
  type AppliedTiming,
} from "@/lib/attendance/timings";
import type { PersonAttendance as PersonData } from "@/lib/attendance/records";
import { BreakLimitSetting } from "@/components/attendance/break-limit";

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
  /** A day this person was due in: the work week and holidays, unless a special
   *  day makes it a working one. */
  expected: boolean;
  /** The hours the day asked for — a special day's, the shift's for that
   *  weekday, or its regular ones. Null without a shift. */
  timing: AppliedTiming | null;
  /** Hours on site the day asked for: its length less lunch. Null on a day off
   *  or without a shift. */
  standard: number | null;
  holiday: string | null;
  leave: { typeName: string; half: boolean } | null;
  record: PersonData["days"][number] | null;
  figures: DayFigures;
  flags: DayFlag[];
  /** Held against the break limit; null when the limit is off, nobody was due
   *  in that day, or there weren't two scans to read a break between. */
  breaks: BreakReading | null;
  bucket: Bucket;
  /** What to show in a status cell. */
  label: string;
};

type SortKey = "date" | "in" | "out" | "hours" | "late" | "breaks";

export function PersonAttendance({
  data,
  people,
}: {
  data: PersonData;
  people: { value: string; label: string }[];
}) {
  const router = useRouter();
  const { employee, shift, from, to, breakRule } = data;

  // The shift's regular hours: the arrival chart's line and the notes that
  // describe the shift. A day with other hours — a short Saturday, a special
  // day — carries its own timing on its row, and every figure for it uses that.
  const shiftWindow = useMemo(
    () => ({
      startMin: toMin(shift.startTime),
      endMin: toMin(shift.endTime),
      graceMin: shift.graceMinutes,
    }),
    [shift.startTime, shift.endTime, shift.graceMinutes],
  );
  const regular =
    shift.startTime && shift.endTime
      ? { start: shift.startTime, end: shift.endTime, graceMinutes: shift.graceMinutes, lunchMinutes: shift.lunchMinutes }
      : null;
  const regularLength = regular ? timingLengthMin(regular) : null;
  const regularStandard = standardMin(regular);
  // Weekdays with their own hours, Monday first — "Sat 10:00–14:00".
  const weekdayHours = WEEK_ORDER.flatMap((d) => {
    const t = shift.weekdays[d];
    return t ? [`${DOW_LABELS[d]} ${t.start}–${t.end}`] : [];
  });
  const timingsVary = weekdayHours.length > 0 || data.specialDays.length > 0;

  // ---- one Row per calendar day in the loaded window ----------------------
  const rows = useMemo<Row[]>(() => {
    const byDate = new Map(data.days.map((d) => [d.dateISO, d]));
    const holidays = new Map(data.holidays.map((h) => [h.dateISO, h.name]));
    const leaves = new Map(data.leaveDays.map((l) => [l.dateISO, l]));
    const holidaySet = new Set(holidays.keys());

    // Only days an import covered. Past the latest report a day isn't an
    // absence, it just hasn't been imported yet — and "this month" nearly
    // always runs ahead of the last report.
    const covered = data.importedRange;
    const first = covered && covered.from > from ? covered.from : from;
    const last = covered && covered.to < to ? covered.to : to;
    const out: Row[] = [];
    for (let d = first; d <= last; d = shiftISO(d, 1)) {
      const record = byDate.get(d) ?? null;
      const timing = timingOn(shift, d, data.specialDays);
      // A special day marked working counts even where the week or a holiday
      // would make it a day off.
      const workingOverride = !!timing?.special?.workingDay;
      const expected = workingOverride || isWorkingDay(d, data.workWeek, holidaySet);
      const figures = computeDay(record?.punchLog, { ...windowOf(timing), expected });
      const flags = record
        ? dayFlags({
            figures,
            deviceStatus: record.deviceStatus,
            deviceWorkMin: record.deviceWorkMin,
          })
        : [];
      // Like lateness, only on days someone was due in.
      const breaks = breakRule && expected ? readBreaks(figures, breakRule) : null;
      const holiday = holidays.get(d) ?? null;
      const leave = leaves.get(d) ?? null;
      const device = parseDeviceStatus(record?.deviceStatus);
      const scanned = figures.punches.length > 0;

      let bucket: Bucket;
      if (holiday && !workingOverride) bucket = "holiday";
      // Leave covers working days only: a weekend inside a leave's dates is
      // still a day off, as the leave balance counts it.
      else if (leave && expected) bucket = "leave";
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

      const standard = expected ? standardMin(timing) : null;
      out.push({ dateISO: d, expected, timing, standard, holiday, leave, record, figures, flags, breaks, bucket, label });
    }
    return out;
  }, [data.days, data.holidays, data.leaveDays, data.workWeek, data.importedRange, data.specialDays, from, to, shift, breakRule]);

  // ---- filters ------------------------------------------------------------
  const [buckets, setBuckets] = useState<Set<Bucket>>(new Set());
  const [lateOver, setLateOver] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyLongBreaks, setOnlyLongBreaks] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });
  const [picked, setPicked] = useState<string | null>(null);

  const lateThreshold = Number.isFinite(Number(lateOver)) && lateOver.trim() !== "" ? Math.max(0, Number(lateOver)) : null;
  const filtersOn = buckets.size > 0 || lateThreshold !== null || onlyFlagged || onlyLongBreaks;

  const matches = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (buckets.size && !buckets.has(r.bucket)) continue;
      if (lateThreshold !== null && r.figures.lateMin <= lateThreshold) continue;
      if (onlyFlagged && r.flags.length === 0) continue;
      if (onlyLongBreaks && r.breaks?.verdict !== "over") continue;
      set.add(r.dateISO);
    }
    return set;
  }, [rows, buckets, lateThreshold, onlyFlagged, onlyLongBreaks]);

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
    // The period's standard: each working day's own — its hours less lunch — in
    // full, half of it on a half day's approved leave (or work from home), none
    // on a full day's.
    const due = kept.filter((r) => r.standard !== null);
    const share = (r: Row) => (r.leave ? (r.leave.half ? 0.5 : 0) : 1);
    const standardDays = due.reduce((n, r) => n + share(r), 0);
    // Counted apart so the note reads "21 days × 8h + 1 half day", in step with
    // the days-worked tile, which counts a half day's leave as a day due in.
    const fullDays = due.filter((r) => share(r) === 1).length;
    const halfDays = due.filter((r) => share(r) === 0.5).length;
    const standardTotal = due.reduce((n, r) => n + share(r) * r.standard!, 0);
    // One figure when every working day asks the same, so a note can say "× 8h".
    const dailies = new Set(due.map((r) => r.standard!));
    return {
      workedDays: worked.length,
      // Due in: working days, less any spent on a full day's approved leave.
      expectedDays: kept.filter((r) => r.expected && !(r.leave && !r.leave.half)).length,
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
      overBreaks: kept.filter((r) => r.breaks?.verdict === "over").length,
      unclearBreaks: kept.filter((r) => r.breaks?.verdict === "unclear").length,
      standardDays,
      fullDays,
      halfDays,
      standardMin: shift.startTime ? Math.round(standardTotal) : null,
      uniformDaily: dailies.size === 1 ? [...dailies][0] : null,
    };
  }, [kept, shift.startTime]);

  // What an average day is held against: the one daily standard when every
  // working day shares it, else their mean.
  const dayStandard =
    facts.uniformDaily ??
    (facts.standardMin !== null && facts.standardDays > 0 ? Math.round(facts.standardMin / facts.standardDays) : null);

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
        case "breaks":
          // The fewest the scans allow, so a day that's surely over outranks
          // one that only might be.
          return r.breaks ? r.breaks.longMin : -1;
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
    setLateOver("");
    setOnlyFlagged(false);
    setOnlyLongBreaks(false);
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
                  {weekdayHours.length > 0 && ` · ${weekdayHours.join(", ")}`}
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
        {/* The same company-wide limit as on the roster: tuning it while looking
            at one person's days re-judges them on the spot. */}
        <div className="border-t border-line px-5 py-3">
          <BreakLimitSetting initial={data.breakLimit} />
        </div>
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
                {breakRule && (
                  <Chip
                    on={onlyLongBreaks}
                    onClick={() => setOnlyLongBreaks(!onlyLongBreaks)}
                    count={rows.filter((r) => r.breaks?.verdict === "over").length}
                  >
                    Over the break limit
                  </Chip>
                )}
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
          {/* Five across with the break limit on, its tile spanning two, so both
              layouts come out as whole rows. */}
          <div className={cn("grid grid-cols-2 gap-2.5", breakRule ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4")}>
            <Tile label="Days worked" value={String(facts.workedDays)} note={`of ${facts.expectedDays} expected`} />
            <Tile
              label="Hours on site"
              value={hoursMin(facts.totalMin)}
              note={
                facts.standardMin === null
                  ? "first scan to last, per day"
                  : `of ${hoursMin(facts.standardMin)} · ${dayCount(facts.fullDays)}${
                      facts.uniformDaily !== null ? ` × ${hoursMin(facts.uniformDaily)}` : ""
                    }${facts.halfDays ? ` + ${facts.halfDays} half ${facts.halfDays === 1 ? "day" : "days"}` : ""}${
                      facts.uniformDaily === null ? ", each at its own hours" : ""
                    }`
              }
              accent={
                facts.standardMin !== null && facts.totalMin < facts.standardMin
                  ? "text-amber-600 dark:text-amber-400"
                  : undefined
              }
            />
            <Tile
              label="Average day"
              value={hoursMin(facts.avgMin)}
              note={
                dayStandard === null
                  ? `${facts.readable} of ${facts.workedDays} days pair in/out cleanly`
                  : facts.uniformDaily === null
                    ? `of ${hoursMin(dayStandard)} a day on average`
                    : dayStandard === regularStandard && regularLength !== null
                      ? `of ${hoursMin(dayStandard)} a day · ${hoursMin(regularLength)} shift${shift.lunchMinutes ? ` less ${hoursMin(shift.lunchMinutes)} lunch` : ", no lunch off"}`
                      : `of ${hoursMin(dayStandard)} a day`
              }
              accent={
                dayStandard !== null && facts.workedDays > 0 && facts.avgMin < dayStandard
                  ? "text-amber-600 dark:text-amber-400"
                  : undefined
              }
            />
            <Tile label="Typical arrival" value={facts.median === null ? "—" : to12h(hhmm(facts.median))} note="median first scan" />
            <Tile
              label="Late arrivals"
              // Never a 0 without a shift: that would read as "always on time"
              // when the truth is that nothing was measured.
              value={shift.startTime ? String(facts.lateDays) : "not measured"}
              note={shift.startTime ? `after ${graceNote}${timingsVary ? " · varies by day" : ""}` : "assign a work shift to get this"}
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
            {breakRule && (
              <Tile
                label="Long breaks"
                value={String(facts.overBreaks)}
                note={`days with ${breakRuleText(breakRule)}${facts.unclearBreaks ? ` · ${facts.unclearBreaks} more can't be told` : ""}`}
                accent={facts.overBreaks > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
                className="col-span-2 sm:col-span-1 lg:col-span-2"
              />
            )}
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
              description={`Hours are first scan to last.${shift.startTime ? " Yellow marks a working day under its standard hours." : ""} A dot marks a day where the device's own figures don't hold up${breakRule ? "; a clock, a day over the break limit" : ""}${data.specialDays.length ? "; a calendar, a special day" : ""}.`}
            />
            <CardBody>
              <MonthGrid
                rows={rows}
                matches={matches}
                dimUnmatched={filtersOn}
                openDate={openDate}
                onPick={setPicked}
              />
            </CardBody>
          </Card>

          {/* ---- the open day -------------------------------------------- */}
          {open && <DayDetail row={open} shift={shift} breakRule={breakRule} />}

          {/* ---- charts --------------------------------------------------- */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="When they arrive"
                description={
                  timingsVary
                    ? "Each scanned day's first punch. The line is the regular start; a dot turns amber when that day was late by its own hours."
                    : "Each scanned day's first punch against the shift line."
                }
              />
              <CardBody>
                <ArrivalChart rows={kept} shiftWindow={shiftWindow} varies={timingsVary} onPick={setPicked} openDate={openDate} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Hours per day"
                description={
                  !shift.startTime
                    ? "First scan to last. No work shift, so there's no day to measure against."
                    : facts.uniformDaily !== null && facts.uniformDaily === regularStandard && regularLength !== null
                      ? `First scan to last, against the ${hoursMin(regularStandard)} standard — the ${hoursMin(regularLength)} shift (${shift.startTime}–${shift.endTime})${shift.lunchMinutes ? ` less ${hoursMin(shift.lunchMinutes)} lunch` : ""}.`
                      : "First scan to last, each against its own day's standard: that day's hours less its lunch."
                }
              />
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
                    {breakRule && (
                      <SortTh col="breaks" sort={sort} onSort={setSort} title={`Breaks over ${breakRule.minutes} min`}>
                        Long breaks
                      </SortTh>
                    )}
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Device said</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {log.length === 0 && (
                    <tr>
                      <td colSpan={breakRule ? 8 : 7} className="px-4 py-10 text-center text-sm text-muted">
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
                        {breakRule && (
                          <td
                            className={cn(
                              "px-4 py-2.5 tabular-nums",
                              r.breaks?.verdict === "over" ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted",
                            )}
                            title={r.breaks ? breakTitle(r.breaks, breakRule) : undefined}
                          >
                            {breakCell(r.breaks)}
                          </td>
                        )}
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

function Tile({
  label,
  value,
  note,
  accent,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-surface px-3.5 py-3 ring-1 ring-inset ring-line", className)}>
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
  title,
  children,
}: {
  col: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (s: { key: SortKey; desc: boolean }) => void;
  title?: string;
  children: React.ReactNode;
}) {
  const on = sort.key === col;
  return (
    <th className="px-4 py-3" title={title}>
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

/**
 * A day's long breaks in a few characters. Exact on a day that pairs cleanly;
 * with a scan missing, only the bound that settles the verdict — "3+" for at
 * least three, "≤ 2" for at most two, "?" when it could go either way.
 */
function breakCell(b: BreakReading | null): string {
  if (!b) return "—";
  if (b.breaks) return b.longMin ? String(b.longMin) : "—";
  if (b.verdict === "over") return `${b.longMin}+`;
  if (b.verdict === "within") return b.longMax ? `≤ ${b.longMax}` : "—";
  return "?";
}

function breakTitle(b: BreakReading, rule: BreakRule): string {
  const over = `over ${rule.minutes} min`;
  const n = (k: number) => `${k} ${k === 1 ? "break" : "breaks"}`;
  if (b.breaks) return `${n(b.longMin)} ${over} — the limit is ${rule.count} a day`;
  if (b.verdict === "over") return `At least ${n(b.longMin)} ${over} — a scan is missing, but however it's read`;
  if (b.verdict === "within") return `No more than ${n(b.longMax)} ${over} — a scan is missing, but however it's read`;
  return `Between ${b.longMin} and ${n(b.longMax)} ${over}, depending on which scan is missing — not counted either way`;
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

function DayCell({
  row,
  dim,
  open,
  onPick,
}: {
  row: Row;
  dim: boolean;
  open: boolean;
  onPick: (d: string) => void;
}) {
  const worked = row.figures.punches.length > 0;
  const longBreaks = row.breaks?.verdict === "over";
  // A working day that came in under its standard reads yellow, like a half
  // day — both are days short of what the shift asked for that day.
  let shortNote = "";
  if (row.standard !== null && row.bucket === "worked" && row.figures.spanMin < row.standard) {
    shortNote = ` · ${hoursMin(row.standard - row.figures.spanMin)} under the day's ${hoursMin(row.standard)}`;
  }
  const special = row.timing?.special ?? null;
  const specialNote = special
    ? ` · special day${special.note ? ` (${special.note})` : ""}: ${special.timing.start}–${special.timing.end}`
    : "";
  return (
    <button
      type="button"
      onClick={() => onPick(row.dateISO)}
      title={`${formatISO(row.dateISO)} — ${row.label}${specialNote}${shortNote}${longBreaks ? " · over the break limit" : ""}`}
      className={cn(
        "relative flex h-16 flex-col items-start justify-between rounded-lg px-2 py-1.5 text-left ring-1 ring-inset transition-all",
        shortNote ? CELL_TONE.half : CELL_TONE[row.bucket],
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
      {(special || longBreaks || row.flags.length > 0) && (
        <span className="absolute right-1.5 top-1 flex items-center gap-1">
          {special && <Icon name="calendar" className="size-3 text-accent-strong" />}
          {longBreaks && <Icon name="clock" className="size-3 text-amber-600 dark:text-amber-400" />}
          {row.flags.length > 0 && <span className="size-1.5 rounded-full bg-amber-500" />}
        </span>
      )}
    </button>
  );
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ---- one day -------------------------------------------------------------

/** Minutes either side of the shift (or the scans) so nothing sits on the edge. */
const TRACK_PAD = 20;
/** How far either side of a punch's dot hovering still finds it, in px. */
const DOT_REACH_PX = 12;

/** An element's rendered width, kept current as it resizes. Null until mounted. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number | null] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** [from, to] in minutes for a day's track: its shift, stretched to the scans. */
function trackSpan(start: number | null, end: number | null, firstIn: number | null, lastOut: number | null): [number, number] {
  let lo: number;
  let hi: number;
  if (start !== null && end !== null) {
    // A night shift's end is the next morning; on this date's track it runs to midnight.
    const shiftEnd = end > start ? end : 1440;
    lo = Math.min(start, firstIn ?? start);
    hi = Math.max(shiftEnd, lastOut ?? shiftEnd);
  } else if (firstIn !== null && lastOut !== null) {
    lo = firstIn;
    hi = lastOut;
  } else {
    lo = 9 * 60;
    hi = 18 * 60;
  }
  lo -= TRACK_PAD;
  hi += TRACK_PAD;
  // A day of two scans a few minutes apart still gets a readable two hours.
  if (hi - lo < 120) {
    const mid = (lo + hi) / 2;
    lo = mid - 60;
    hi = mid + 60;
  }
  return [lo, hi];
}

/** A label near either end of the track hangs inward instead of off the edge. */
function edgeAlign(at: number): string {
  return at < 5 ? "" : at > 95 ? "-translate-x-full" : "-translate-x-1/2";
}

/**
 * The punches as in → out pairs, in the device's own labelling with its
 * re-reads dropped. An in with no out before the next in, or an out with no in
 * before it, is kept as half a pair rather than matched to a guess.
 */
function punchPairs(punches: Punch[]): { in: number | null; out: number | null }[] {
  const pairs: { in: number | null; out: number | null }[] = [];
  let open: number | null = null;
  for (const p of realScans(punches)) {
    if ((p.dir ?? "in") === "in") {
      if (open !== null) pairs.push({ in: open, out: null });
      open = p.min;
    } else {
      pairs.push({ in: open, out: p.min });
      open = null;
    }
  }
  if (open !== null) pairs.push({ in: open, out: null });
  return pairs;
}

function DayDetail({
  row,
  shift,
  breakRule,
}: {
  row: Row;
  shift: PersonData["shift"];
  breakRule: BreakRule | null;
}) {
  const f = row.figures;
  // This day's own hours — a short Saturday's or a special day's where they apply.
  const shiftWindow = windowOf(row.timing);
  const device = parseDeviceStatus(row.record?.deviceStatus);
  const meta = BUCKET_META.get(row.bucket)!;

  // The track spans the day's own shift — a short Saturday's or a special day's
  // hours where they apply — so the working day fills the width. It stretches
  // only to take in a scan before the start or after the end. No shift: the
  // scans themselves.
  const [lo, hi] = trackSpan(shiftWindow.startMin, shiftWindow.endMin, f.firstIn, f.lastOut);
  const pct = (min: number) => ((min - lo) / (hi - lo)) * 100;
  const pairs = punchPairs(f.punches);
  // The track's real width, measured once mounted: it spaces the hour labels
  // and sizes each dot's hover reach.
  const [trackRef, trackWidth] = useWidth<HTMLDivElement>();
  // A faint line every hour across a shift; labels every hour while there's room
  // for one, every two or three on a narrow screen.
  const pxPerHour = trackWidth ? trackWidth / ((hi - lo) / 60) : 100;
  const gridStep = hi - lo <= 13 * 60 ? 60 : 120;
  const gridHours = axisHours(lo, hi, gridStep);
  const labelHours = axisHours(lo, hi, Math.max(gridStep, pxPerHour >= 44 ? 60 : pxPerHour >= 22 ? 120 : 180));
  // A dot per punch — the device's re-reads left out — in green for an in and
  // red for an out, its time shown on hover. Each owns the stretch of track
  // nearest to it (up to DOT_REACH_PX either side), so two punches minutes
  // apart are still two separate things to point at.
  const reach = trackWidth ? (DOT_REACH_PX / trackWidth) * 100 : 1.2;
  const marks = realScans(f.punches).map((p) => ({ min: p.min, dir: p.dir ?? "in", at: pct(p.min) }));
  const dots = marks.map((m, i) => {
    const prev = marks[i - 1];
    const next = marks[i + 1];
    const from = Math.max(m.at - reach, prev ? (prev.at + m.at) / 2 : -Infinity);
    const to = Math.min(m.at + reach, next ? (m.at + next.at) / 2 : Infinity);
    const width = Math.max(to - from, 0.2);
    return { ...m, from, width, offset: ((m.at - from) / width) * 100 };
  });

  const facts: { label: string; value: string; tone?: string }[] = [
    { label: "In", value: f.firstIn === null ? "—" : to12h(hhmm(f.firstIn)) },
    { label: "Out", value: f.lastOut === null ? "—" : to12h(hhmm(f.lastOut)) },
    {
      label: "Hours",
      value: f.punches.length ? `${hoursMin(f.spanMin)}${row.standard !== null ? ` of ${hoursMin(row.standard)}` : ""}` : "—",
      tone: f.punches.length && row.standard !== null && f.spanMin < row.standard ? "text-amber-600 dark:text-amber-400" : undefined,
    },
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
        description={timingLine(row, shift)}
      />
      <CardBody className="space-y-5">
        {/* The day on a clock, across its shift. One bar from the first scan to
            the last, a dot per punch — green in, red out — that names its time
            on hover. Breaks are cut into the bar only on a day whose scans pair
            cleanly — on the rest a missing scan shifts every in/out label after
            it, and cutting on those would invent breaks that weren't there. */}
        <div ref={trackRef}>
          <div className="relative h-12 rounded-xl bg-canvas ring-1 ring-inset ring-line">
            {/* the shift, as one labelled band */}
            {shiftWindow.startMin !== null && shiftWindow.endMin !== null && (
              <div
                className="absolute inset-y-0 border-x border-brand-500/40 bg-brand-500/[0.06]"
                style={{
                  left: `${pct(shiftWindow.startMin)}%`,
                  width: `${pct(shiftWindow.endMin > shiftWindow.startMin ? shiftWindow.endMin : 1440) - pct(shiftWindow.startMin)}%`,
                }}
                title={`Shift ${hhmm(shiftWindow.startMin)} – ${hhmm(shiftWindow.endMin)}`}
              />
            )}
            {/* an hour line every hour mark, faint, to read times off */}
            {gridHours.map((h) => (
              <div key={`grid-${h}`} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pct(h)}%` }} />
            ))}
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
            {/* breaks: a long one in amber, a short one as a gap in the bar */}
            {breakRule &&
              row.breaks?.breaks?.map((b) => (
                <div
                  key={`break-${b.from}`}
                  className={cn(
                    "absolute top-1/2 h-2.5 -translate-y-1/2",
                    b.to - b.from > breakRule.minutes ? "bg-amber-400" : "bg-canvas",
                  )}
                  style={{ left: `${pct(b.from)}%`, width: `${pct(b.to) - pct(b.from)}%` }}
                  title={`Break ${to12h(hhmm(b.from))} – ${to12h(hhmm(b.to))} · ${hoursMin(b.to - b.from)}`}
                />
              ))}
            {dots.map((d) => {
              const label = `${d.dir === "in" ? "In" : "Out"} ${to12h(hhmm(d.min))}`;
              return (
                <div
                  key={`${d.min}-${d.dir}`}
                  role="img"
                  aria-label={label}
                  className="group absolute top-1/2 z-10 h-8 -translate-y-1/2 hover:z-20"
                  style={{ left: `${d.from}%`, width: `${d.width}%` }}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm ring-[2.5px] transition-transform group-hover:scale-125 dark:bg-surface",
                      d.dir === "in" ? "ring-emerald-600" : "ring-rose-500",
                    )}
                    style={{ left: `${d.offset}%` }}
                  />
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100",
                      d.dir === "in" ? "bg-emerald-700" : "bg-rose-600",
                    )}
                    style={{ left: `${d.offset}%` }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
            {f.punches.length === 0 && (
              <span className="absolute inset-0 flex items-center justify-center text-xs text-faint">
                No scans on this day
              </span>
            )}
          </div>
          {/* hour labels along the bottom */}
          <div className="relative mt-1 h-4">
            {labelHours.map((h) => (
              <span
                key={h}
                className={cn("absolute text-[11px] tabular-nums text-faint", edgeAlign(pct(h)))}
                style={{ left: `${pct(h)}%` }}
              >
                {clockLabel(h)}
              </span>
            ))}
          </div>

          {/* every punch, paired in to out as the device labelled them */}
          {pairs.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Punches</span>
              {pairs.map((p, i) => {
                const whole = p.in !== null && p.out !== null;
                return (
                  <span
                    key={i}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs tabular-nums ring-1 ring-inset",
                      whole
                        ? "bg-surface text-content ring-line"
                        : "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/25",
                    )}
                    title={whole ? undefined : p.in === null ? "No in-scan before this out" : "No out-scan after this in"}
                  >
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">In</span>
                    {p.in !== null ? to12h(hhmm(p.in)) : "—"}
                    <span className="text-faint">→</span>
                    <span className="font-medium text-rose-600 dark:text-rose-400">Out</span>
                    {p.out !== null ? to12h(hhmm(p.out)) : "—"}
                    {whole && <span className="ml-1 font-semibold">{hoursMin(p.out! - p.in!)}</span>}
                  </span>
                );
              })}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
            {dots.length > 0 && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-white ring-2 ring-emerald-600 dark:bg-surface" />
                  In
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-white ring-2 ring-rose-500 dark:bg-surface" />
                  Out
                </span>
              </>
            )}
            {f.lateMin > 0 && (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-1.5 w-4 rounded-full bg-amber-400" />
                {hoursMin(f.lateMin)} late
              </span>
            )}
            {breakRule && row.breaks?.breaks?.some((b) => b.to - b.from > breakRule.minutes) && (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-1.5 w-4 bg-amber-400" />
                Break over {breakRule.minutes} min
              </span>
            )}
            {breakRule && row.breaks?.breaks?.some((b) => b.to - b.from <= breakRule.minutes) && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-sm bg-canvas ring-1 ring-inset ring-line-strong" />
                Shorter break
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

        {breakRule && <BreaksPanel row={row} rule={breakRule} />}

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

/**
 * The day against the break limit, in words: the breaks themselves on a day
 * that pairs cleanly, and on one that doesn't, what holds however the missing
 * scan is read — or, when nothing does, that the day isn't counted.
 */
function BreaksPanel({ row, rule }: { row: Row; rule: BreakRule }) {
  const b = row.breaks;
  if (!b) {
    // Scanned on a day off: say why nothing is judged rather than go quiet.
    return !row.expected && row.figures.punches.length > 1 ? (
      <p className="text-sm text-muted">Not a working day, so the break limit doesn&apos;t apply.</p>
    ) : null;
  }

  const over = b.verdict === "over";
  const len = `over ${rule.minutes} min`;
  const limit = rule.count === 0 ? "none allowed" : `limit ${rule.count} a day`;
  const plural = (k: number) => `${k} ${k === 1 ? "break" : "breaks"}`;
  const slip = "A scan is missing or extra, so the breaks can't be listed";

  let summary: string;
  if (b.breaks) {
    if (b.breaks.length === 0) summary = "No breaks — one stretch from the first scan to the last.";
    else if (b.longMin === 0) summary = `None of the ${plural(b.breaks.length)} ran ${len}.`;
    else summary = `${b.longMin} of ${plural(b.breaks.length)} ran ${len} (${limit}).`;
  } else if (over) {
    summary = `${slip} — but however they're read, at least ${b.longMin} ran ${len} (${limit}).`;
  } else if (b.verdict === "within") {
    summary = b.longMax
      ? `${slip} — but however they're read, no more than ${b.longMax} ran ${len} (${limit}).`
      : `${slip} — but however they're read, none ran ${len}.`;
  } else {
    summary = `A scan is missing or extra, and where it was decides it: between ${b.longMin} and ${plural(b.longMax)} ran ${len}. This day isn't counted either way.`;
  }

  return (
    <div
      className={cn(
        "rounded-xl px-4 py-3 ring-1 ring-inset",
        over
          ? "bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/25"
          : "bg-canvas ring-line",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wide",
            over ? "text-amber-700 dark:text-amber-300" : "text-faint",
          )}
        >
          Breaks
        </p>
        {over && <Badge tone="amber">Over the limit</Badge>}
        {b.verdict === "unclear" && <Badge tone="gray">Can&apos;t tell</Badge>}
      </div>
      <p className={cn("mt-1 text-sm", over ? "text-amber-800 dark:text-amber-200" : "text-muted")}>{summary}</p>
      {b.breaks && b.breaks.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {b.breaks.map((x) => {
            const long = x.to - x.from > rule.minutes;
            return (
              <li
                key={x.from}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs tabular-nums ring-1 ring-inset",
                  long
                    ? "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-500/30"
                    : "bg-surface text-muted ring-line",
                )}
              >
                {to12h(hhmm(x.from))} – {to12h(hhmm(x.to))}
                <span className="ml-1.5 font-semibold">{hoursMin(x.to - x.from)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Hour marks across the track, every `step` minutes on the hour. */
function axisHours(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let h = Math.ceil(lo / step) * step; h <= hi; h += step) out.push(h);
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
  varies,
  onPick,
  openDate,
}: {
  rows: Row[];
  /** The shift's regular start and grace. */
  shiftWindow: { startMin: number | null; graceMin: number };
  /** Some days ask for other hours, so the line is only the usual start. */
  varies: boolean;
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
            <span className="h-px w-4 bg-brand-500/70" /> {varies ? "regular start" : "shift start"} {hhmm(start)}
            {shiftWindow.graceMin > 0 && <span className="text-faint">+ {shiftWindow.graceMin}m grace</span>}
          </span>
        )}
      </div>
    </div>
  );
}

/** 26 → "26 days", 1 → "1 day". */
function dayCount(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** What the day asked for, in words: whose hours they were, and what they were. */
function timingLine(row: Row, shift: PersonData["shift"]): string {
  const t = row.timing;
  if (!t) return "No work shift assigned, so lateness can't be measured";
  const hours = `${t.start}–${t.end}${t.graceMinutes ? `, ${t.graceMinutes} min grace` : ""}${row.standard !== null ? `, ${hoursMin(row.standard)} on site` : ""}`;
  const whose =
    t.source === "special"
      ? `Special day${t.special?.note ? ` (${t.special.note})` : ""}`
      : t.source === "weekday"
        ? `${WEEKDAY_NAMES[new Date(`${row.dateISO}T00:00:00Z`).getUTCDay()]} hours`
        : `Shift${shift.name ? ` ${shift.name}` : ""}`;
  return `${whose}: ${hours}${shift.fromDefault ? " · company default shift" : ""}`;
}

const BAR_FULL = "rgb(16 185 129 / 0.8)";
const BAR_SHORT = "rgb(245 158 11 / 0.75)";
const BAR_OFF = "rgb(148 163 184 / 0.7)";
const BAR_OPEN = "rgb(79 70 229)";

/**
 * Each scanned day's hours against that day's standard (its hours less lunch):
 * green when it reached it, amber when it fell short, grey on a day nobody was
 * due in. The standard is one dashed line while every day shares it, and a
 * mark on each bar once they differ — a short Saturday, a special day.
 */
function HoursChart({ rows, onPick, openDate }: { rows: Row[]; onPick: (d: string) => void; openDate: string | null }) {
  const bars = rows.filter((r) => r.figures.punches.length > 0);
  if (bars.length === 0) return <p className="py-10 text-center text-sm text-muted">No scanned days in this selection.</p>;
  const peak = Math.max(...bars.map((r) => r.figures.spanMin));
  const standards = bars.flatMap((r) => (r.standard === null ? [] : [r.standard]));
  const uniform = new Set(standards).size === 1 ? standards[0] : null;
  // Tall enough for the standard even when every day fell short of it.
  const max = Math.max(peak, ...standards, 60);
  const width = 100 / bars.length;
  const yAt = (min: number) => CHART_H - (min / max) * CHART_H;
  const anyOff = bars.some((r) => !r.expected);
  const target = standards.length ? uniform : null;

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" className="h-40 w-full">
        {uniform !== null && (
          <line x1={0} x2={100} y1={yAt(uniform)} y2={yAt(uniform)} stroke="rgb(99 102 241 / 0.5)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        {bars.map((r, i) => {
          const span = r.figures.spanMin;
          const h = (span / max) * CHART_H;
          const std = r.standard;
          const short = std !== null && span < std;
          const note = !r.expected
            ? " · not a working day"
            : std === null
              ? ""
              : short
                ? ` · ${hoursMin(std - span)} short of the day's ${hoursMin(std)}`
                : " · standard met";
          return (
            <g key={r.dateISO}>
              <rect
                x={i * width + width * 0.15}
                y={CHART_H - h}
                width={width * 0.7}
                height={h}
                rx={0.6}
                className="cursor-pointer"
                fill={r.dateISO === openDate ? BAR_OPEN : !r.expected ? BAR_OFF : short ? BAR_SHORT : BAR_FULL}
                onClick={() => onPick(r.dateISO)}
              >
                <title>{`${formatISO(r.dateISO)} — ${hoursMin(span)}${note}`}</title>
              </rect>
              {uniform === null && std !== null && (
                <line
                  x1={i * width + width * 0.05}
                  x2={(i + 1) * width - width * 0.05}
                  y1={yAt(std)}
                  y2={yAt(std)}
                  stroke="rgb(79 70 229 / 0.8)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-faint">
        <span>Peak {hoursMin(peak)}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {standards.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: BAR_FULL }} /> met
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: BAR_SHORT }} /> short
              </span>
            </>
          )}
          {anyOff && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: BAR_OFF }} /> day off
            </span>
          )}
          {standards.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              {target !== null ? (
                <>
                  <span className="h-px w-4 border-t border-dashed border-brand-500/60" /> {hoursMin(target)} standard
                </>
              ) : (
                <>
                  <span className="h-0.5 w-4 bg-brand-600/80" /> each day&apos;s standard
                </>
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
