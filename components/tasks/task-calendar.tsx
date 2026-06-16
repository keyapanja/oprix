"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskRow } from "./tasks-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Small status dot inside each (green, outlined) task strip.
const STATUS_DOT: Record<string, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  REVIEW: "bg-amber-500",
  REDO: "bg-rose-500",
  CLIENT_REVIEW: "bg-violet-500",
  COMPLETED: "bg-emerald-500",
};

const HEADER_PX = 24; // room for the day number
const LANE_PX = 20; // height of one event lane
const MAX_LANES = 3; // visible lanes per week before "+N more"

const pad = (n: number) => String(n).padStart(2, "0");

type Cell = { day: number; iso: string } | null;
type Seg = {
  task: TaskRow;
  startCol: number; // 1-based column within the week
  span: number;
  isStart: boolean; // the task's real start falls in this week
  isEnd: boolean; // the task's deadline falls in this week
  lane: number;
};

export function TaskCalendar({ tasks, today }: { tasks: TaskRow[]; today: string }) {
  const router = useRouter();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const { y, m } = ym;

  const { weeks, segsByWeek, moreByIso, noDate } = useMemo(() => {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const startOffset = (first.getUTCDay() + 6) % 7; // grid begins on Monday
    const cells: Cell[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push({ day: d, iso: `${y}-${pad(m)}-${pad(d)}` });
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    // Each task occupies the range [assigned date, due date].
    let noDate = 0;
    const ranges: { task: TaskRow; start: string; end: string }[] = [];
    for (const t of tasks) {
      if (!t.dueDate) { noDate++; continue; }
      const start = t.assignedDate && t.assignedDate < t.dueDate ? t.assignedDate : t.dueDate;
      ranges.push({ task: t, start, end: t.dueDate });
    }

    const moreByIso = new Map<string, number>();
    const segsByWeek: Seg[][] = weeks.map((week) => {
      const isos = week.map((c) => c?.iso ?? null);
      const present = isos.filter((x): x is string => !!x);
      if (present.length === 0) return [];
      const firstIso = present[0];
      const lastIso = present[present.length - 1];

      // Clip each overlapping task to this week and find its columns.
      const raw = ranges
        .filter((r) => !(r.end < firstIso || r.start > lastIso))
        .map((r) => {
          const cs = r.start < firstIso ? firstIso : r.start;
          const ce = r.end > lastIso ? lastIso : r.end;
          const startCol = isos.indexOf(cs) + 1;
          const endCol = isos.indexOf(ce) + 1;
          return {
            task: r.task,
            startCol,
            span: endCol - startCol + 1,
            isStart: r.start >= firstIso,
            isEnd: r.end <= lastIso,
          };
        });

      // Greedy lane packing — earliest start first, longer spans win ties.
      raw.sort((a, b) => a.startCol - b.startCol || b.span - a.span);
      const laneEnd: number[] = []; // last occupied column per lane
      const segs: Seg[] = raw.map((s) => {
        const end = s.startCol + s.span - 1;
        let lane = laneEnd.findIndex((e) => e < s.startCol);
        if (lane === -1) { lane = laneEnd.length; laneEnd.push(end); }
        else laneEnd[lane] = end;
        return { ...s, lane };
      });

      // Lanes past the cap are hidden → count "+N" per covered day.
      for (const s of segs) {
        if (s.lane < MAX_LANES) continue;
        for (let col = s.startCol; col < s.startCol + s.span; col++) {
          const day = isos[col - 1];
          if (day) moreByIso.set(day, (moreByIso.get(day) ?? 0) + 1);
        }
      }
      return segs.filter((s) => s.lane < MAX_LANES);
    });

    return { weeks, segsByWeek, moreByIso, noDate };
  }, [tasks, y, m]);

  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const prev = () => setYm((s) => (s.m === 1 ? { y: s.y - 1, m: 12 } : { y: s.y, m: s.m - 1 }));
  const next = () => setYm((s) => (s.m === 12 ? { y: s.y + 1, m: 1 } : { y: s.y, m: s.m + 1 }));

  const weekMinH = HEADER_PX + MAX_LANES * LANE_PX + 16;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={prev} aria-label="Previous month"><Icon name="chevronLeft" className="size-4" /></Button>
        <span className="font-semibold text-content">{monthLabel}</span>
        <Button variant="secondary" size="sm" onClick={next} aria-label="Next month"><Icon name="chevronRight" className="size-4" /></Button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-faint">
        {WD.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        {weeks.map((week, wi) => (
          <div key={wi} className="relative border-b border-line last:border-b-0" style={{ minHeight: weekMinH }}>
            {/* Day cells (backgrounds, numbers, "+N more") */}
            <div className="grid grid-cols-7">
              {week.map((c, ci) => (
                <div
                  key={ci}
                  className={cn("relative border-r border-line last:border-r-0", c?.iso === today && "bg-accent-soft/30")}
                  style={{ minHeight: weekMinH }}
                >
                  {c && (
                    <div className="flex justify-end px-1.5 pt-1">
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center text-[11px] tabular-nums",
                          c.iso === today ? "rounded-full bg-brand-600 font-semibold text-white" : "text-faint",
                        )}
                      >
                        {c.day}
                      </span>
                    </div>
                  )}
                  {c && (moreByIso.get(c.iso) ?? 0) > 0 && (
                    <span className="absolute bottom-1 left-1.5 text-[10px] text-faint">+{moreByIso.get(c.iso)} more</span>
                  )}
                </div>
              ))}
            </div>

            {/* Event bars overlay — continuous strips spanning their days */}
            <div className="pointer-events-none absolute inset-0">
              {segsByWeek[wi].map((s, si) => {
                const t = s.task;
                const leftPct = ((s.startCol - 1) / 7) * 100;
                const widthPct = (s.span / 7) * 100;
                return (
                  <button
                    key={`${t.id}:${si}`}
                    onClick={() => router.push(`/tasks/${t.id}`)}
                    title={t.name}
                    className={cn(
                      "pointer-events-auto absolute flex items-center gap-1.5 overflow-hidden px-1.5 text-left text-[11px] font-medium",
                      "bg-brand-500/10 text-brand-700 ring-1 ring-inset ring-brand-500/45 transition-colors hover:bg-brand-500/20 dark:text-brand-200",
                      s.isStart ? "rounded-l-md" : "rounded-l-none",
                      s.isEnd ? "rounded-r-md" : "rounded-r-none",
                    )}
                    style={{
                      left: `calc(${leftPct}% + 3px)`,
                      width: `calc(${widthPct}% - 6px)`,
                      top: HEADER_PX + s.lane * LANE_PX,
                      height: LANE_PX - 4,
                    }}
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[t.status] ?? "bg-slate-400")} />
                    <span className="truncate">{t.name}</span>
                    {s.isEnd && <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wide text-brand-700/70 dark:text-brand-200/70">Due</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {noDate > 0 && <p className="mt-3 text-xs text-muted">{noDate} task{noDate > 1 ? "s" : ""} with no due date (not shown).</p>}
    </Card>
  );
}
