"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskRow } from "./tasks-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_DOT: Record<string, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  REVIEW: "bg-amber-500",
  REDO: "bg-rose-500",
  CLIENT_REVIEW: "bg-violet-500",
  COMPLETED: "bg-emerald-500",
};

export function TaskCalendar({ tasks, today }: { tasks: TaskRow[]; today: string }) {
  const router = useRouter();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));

  const byDay = new Map<string, TaskRow[]>();
  let noDate = 0;
  for (const t of tasks) {
    if (!t.dueDate) { noDate++; continue; }
    const arr = byDay.get(t.dueDate) ?? [];
    arr.push(t);
    byDay.set(t.dueDate, arr);
  }

  const { y, m } = ym;
  const first = new Date(Date.UTC(y, m - 1, 1));
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startOffset = (first.getUTCDay() + 6) % 7; // grid begins on Monday
  const cells: ({ day: number; iso: string } | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push({ day: d, iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const prev = () => setYm((s) => (s.m === 1 ? { y: s.y - 1, m: 12 } : { y: s.y, m: s.m - 1 }));
  const next = () => setYm((s) => (s.m === 12 ? { y: s.y + 1, m: 1 } : { y: s.y, m: s.m + 1 }));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={prev} aria-label="Previous month"><Icon name="chevronLeft" className="size-4" /></Button>
        <span className="font-semibold text-content">{monthLabel}</span>
        <Button variant="secondary" size="sm" onClick={next} aria-label="Next month"><Icon name="chevronRight" className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-faint">
        {WD.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) =>
          c === null ? (
            <div key={i} className="min-h-20 rounded-lg bg-canvas/40" />
          ) : (
            <div key={i} className={cn("min-h-20 rounded-lg border border-line p-1", c.iso === today && "ring-1 ring-brand-500")}>
              <div className="mb-1 text-right text-[11px] tabular-nums text-faint">{c.day}</div>
              <div className="space-y-0.5">
                {(byDay.get(c.iso) ?? []).slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => router.push(`/tasks/${t.id}`)}
                    className="flex w-full items-center gap-1 rounded bg-canvas px-1 py-0.5 text-left text-[11px] text-content transition-colors hover:bg-surface"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[t.status])} />
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
                {(byDay.get(c.iso)?.length ?? 0) > 4 && (
                  <span className="px-1 text-[10px] text-faint">+{(byDay.get(c.iso)!.length) - 4} more</span>
                )}
              </div>
            </div>
          ),
        )}
      </div>
      {noDate > 0 && <p className="mt-3 text-xs text-muted">{noDate} task{noDate > 1 ? "s" : ""} with no due date (not shown).</p>}
    </Card>
  );
}
