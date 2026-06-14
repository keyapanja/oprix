"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startTimer, pauseTimer } from "@/lib/timer/actions";
import { Icon } from "@/components/ui/icons";
import { fmtClock, liveSeconds, type TimerStatusUI } from "@/lib/timer/shared";

export function TaskTimerControl({
  taskId,
  status,
  baseSeconds,
  runStartedAtMs,
  locked = false,
  lockedReason,
}: {
  taskId: string;
  status: TimerStatusUI;
  baseSeconds: number;
  runStartedAtMs: number | null;
  locked?: boolean;
  lockedReason?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState<number | null>(null);

  // Tick only while running; null `now` pre-mount keeps SSR/CSR in sync.
  useEffect(() => {
    setNow(Date.now());
    if (status !== "RUNNING") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const seconds = liveSeconds(status, baseSeconds, runStartedAtMs, now);
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const live = status === "RUNNING";
  const paused = status === "PAUSED";

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2.5">
        <span
          className={
            "flex size-2.5 rounded-full " +
            (live ? "animate-pulse bg-emerald-500" : paused ? "bg-amber-500" : "bg-faint/40")
          }
        />
        <span className="font-display text-2xl font-bold tabular-nums text-content">
          {fmtClock(seconds)}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-faint">
          {live ? "Running" : paused ? "Paused" : "Not started"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {locked && (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-canvas px-3 py-2 text-xs font-medium text-faint ring-1 ring-inset ring-line">
            <Icon name="logout" className="size-3.5" />
            {lockedReason ?? "Timer locked"}
          </span>
        )}
        {!locked && status === "NONE" && (
          <button
            onClick={() => run(() => startTimer(taskId))}
            disabled={pending}
            className="gradient-brand-strong inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-brand transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            <Icon name="play" className="size-4" fill="currentColor" stroke="none" />
            Start timer
          </button>
        )}
        {!locked && live && (
          <button
            onClick={() => run(() => pauseTimer(taskId))}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-canvas px-4 py-2 text-sm font-semibold text-content ring-1 ring-inset ring-line transition-all hover:bg-surface active:scale-[0.98] disabled:opacity-60"
          >
            <Icon name="pause" className="size-4" />
            Pause
          </button>
        )}
        {!locked && paused && (
          <button
            onClick={() => run(() => startTimer(taskId))}
            disabled={pending}
            className="gradient-brand-strong inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-brand transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            <Icon name="play" className="size-4" fill="currentColor" stroke="none" />
            Resume
          </button>
        )}
      </div>
    </div>
  );
}
