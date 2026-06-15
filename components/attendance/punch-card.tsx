"use client";

import { toast } from "@/components/ui/toast";
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { punchIn, punchOut } from "@/lib/attendance/self";
import { nowInZone, to12h } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
function fmtMins(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function minToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function PunchCard({
  initialIn,
  initialOut,
  timeZone,
  shiftStart,
  graceMinutes,
}: {
  initialIn: string | null;
  initialOut: string | null;
  timeZone: string;
  shiftStart: string | null;
  graceMinutes: number;
}) {
  const [clockIn, setClockIn] = useState(initialIn);
  const [clockOut, setClockOut] = useState(initialOut);
  const [elapsed, setElapsed] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Adopt refreshed server props — e.g. after punching in from the top banner,
  // or this card's own router.refresh() — so the card never goes stale.
  useEffect(() => {
    setClockIn(initialIn);
    setClockOut(initialOut);
  }, [initialIn, initialOut]);

  const inProgress = !!clockIn && !clockOut;
  const done = !!clockIn && !!clockOut;
  // On-time as long as you punch in within start + grace.
  const cutoffMin = shiftStart ? toMin(shiftStart) + graceMinutes : null;
  const cutoffStr = cutoffMin !== null ? minToHHMM(cutoffMin) : null;
  const late = cutoffMin !== null && clockIn ? toMin(clockIn) > cutoffMin : false;
  const lateBy = late && cutoffMin !== null && clockIn ? toMin(clockIn) - cutoffMin : 0;

  // Live "punched in for" timer while the session is open.
  useEffect(() => {
    if (!clockIn || clockOut) return;
    const tick = () => {
      const now = nowInZone(timeZone).time;
      let mins = toMin(now) - toMin(clockIn);
      if (mins < 0) mins += 24 * 60;
      setElapsed(mins);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [clockIn, clockOut, timeZone]);

  const total = done ? toMin(clockOut!) - toMin(clockIn!) : 0;

  function onPunchIn() {
    start(async () => {
      const res = await punchIn();
      if (res.error) toast.error(res.error);
      else if (res.time) {
        setClockIn(res.time); // start the live timer immediately, no refresh needed
        router.refresh(); // re-render the layout so the punch-in gate/banner lift
      }
    });
  }
  function onPunchOut() {
    start(async () => {
      const res = await punchOut();
      if (res.error) toast.error(res.error);
      else if (res.time) {
        setClockOut(res.time);
        router.refresh();
      }
    });
  }

  return (
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
      <div className="flex items-center gap-4">
        <span
          className={
            "flex size-12 items-center justify-center rounded-2xl " +
            (clockIn
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
              : "bg-canvas text-faint")
          }
        >
          <Icon name="clock" className="size-6" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-content">Today&apos;s attendance</h2>
            {clockIn ? <Badge tone="green">Present</Badge> : <Badge tone="gray">Not started</Badge>}
            {late && <Badge tone="amber">Late</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {done
              ? `Worked ${fmtDuration(total)} today (${to12h(clockIn ?? "")} – ${to12h(clockOut ?? "")}).`
              : inProgress
                ? late
                  ? `Started at ${to12h(clockIn ?? "")} · ${fmtMins(lateBy)} late (grace until ${to12h(cutoffStr ?? "")}).`
                  : `Started at ${to12h(clockIn ?? "")}${shiftStart ? ` · on time` : ""}.`
                : "Start your session to be marked Present for today."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {inProgress && (
          <div className="text-right">
            <p className="text-xs font-medium text-faint">Punched in for</p>
            <p className="font-display text-2xl font-bold tabular-nums text-content">
              {fmtDuration(elapsed)}
            </p>
            <p className="text-xs text-faint">since {to12h(clockIn ?? "")}</p>
          </div>
        )}
        {done && (
          <div className="text-right">
            <p className="text-xs font-medium text-faint">Total today</p>
            <p className="font-display text-2xl font-bold tabular-nums text-content">
              {fmtDuration(total)}
            </p>
          </div>
        )}

        {!clockIn && (
          <button
            onClick={onPunchIn}
            disabled={pending}
            className="gradient-brand-strong inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-brand transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            <Icon name="clock" className="size-4" />
            {pending ? "Starting…" : "Punch in"}
          </button>
        )}
        {inProgress && (
          <button
            onClick={onPunchOut}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 active:scale-[0.98] disabled:opacity-60"
          >
            <Icon name="logout" className="size-4" />
            {pending ? "Ending…" : "Punch out"}
          </button>
        )}
        {done && (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-canvas px-4 py-2.5 text-sm font-medium text-muted">
            <Icon name="check" className="size-4 text-emerald-500" />
            Day complete
          </span>
        )}
      </div>
    </Card>
  );
}
