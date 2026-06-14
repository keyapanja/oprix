"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startTimer, pauseTimer, stopTimer } from "@/lib/timer/actions";
import { Icon } from "@/components/ui/icons";
import { fmtClock, liveSeconds, type ActiveTimer } from "@/lib/timer/shared";

export function TimerBar({ timers }: { timers: ActiveTimer[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState<number | null>(null);
  const anyRunning = timers.some((t) => t.status === "RUNNING");

  // One shared 1s tick for the whole bar; null pre-mount avoids hydration drift.
  useEffect(() => {
    setNow(Date.now());
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  if (timers.length === 0) return null;

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const runningCount = timers.filter((t) => t.status === "RUNNING").length;

  return (
    <div className="shrink-0 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-2.5">
        <div className="flex shrink-0 items-center gap-2 pr-1">
          <Icon name="clock" className="size-4 text-accent-strong" />
          <span className="text-xs font-semibold text-content">
            {runningCount > 0 ? `${runningCount} running` : "Paused"}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {timers.map((t) => {
            const live = t.status === "RUNNING";
            const seconds = liveSeconds(t.status, t.baseSeconds, t.runStartedAtMs, now);
            return (
              <div
                key={t.taskId}
                className="flex shrink-0 items-center gap-2.5 rounded-xl bg-canvas px-3 py-1.5 ring-1 ring-inset ring-line"
              >
                <span
                  className={
                    "flex size-2 rounded-full " +
                    (live ? "animate-pulse bg-emerald-500" : "bg-amber-500")
                  }
                />
                <Link href={`/tasks/${t.taskId}`} className="min-w-0">
                  <span className="block max-w-[14rem] truncate text-sm font-medium text-content hover:text-accent-strong">
                    {t.taskName}
                  </span>
                  <span className="block max-w-[14rem] truncate text-[11px] text-faint">
                    {t.projectName}
                  </span>
                </Link>
                <span className="font-display text-sm font-bold tabular-nums text-content">
                  {fmtClock(seconds)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => act(() => (live ? pauseTimer(t.taskId) : startTimer(t.taskId)))}
                    disabled={pending}
                    title={live ? "Pause" : "Resume"}
                    className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-content disabled:opacity-50"
                  >
                    <Icon
                      name={live ? "pause" : "play"}
                      className="size-4"
                      {...(live ? {} : { fill: "currentColor", stroke: "none" })}
                    />
                  </button>
                  <button
                    onClick={() => act(() => stopTimer(t.taskId))}
                    disabled={pending}
                    title="Stop & log"
                    className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
                  >
                    <Icon name="stop" className="size-3.5" fill="currentColor" stroke="none" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
