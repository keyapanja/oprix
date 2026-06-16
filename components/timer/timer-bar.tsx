"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { pauseTimer, startTimer, getMyActiveTimers } from "@/lib/timer/actions";
import { Icon } from "@/components/ui/icons";
import { fmtClock, liveSeconds, type ActiveTimer } from "@/lib/timer/shared";

export function TimerBar({ timers: initial }: { timers: ActiveTimer[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState<number | null>(null);
  const [timers, setTimers] = useState<ActiveTimer[]>(initial);

  // One shared 1s tick for the whole bar; null pre-mount avoids hydration drift.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live sync: poll the user's active timers so a start/pause done elsewhere
  // (the browser extension, another tab/device) shows here without a reload.
  const refresh = useCallback(async () => {
    try {
      setTimers(await getMyActiveTimers());
    } catch {
      /* transient; next tick retries */
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, 8000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  if (timers.length === 0) return null;

  const runningCount = timers.filter((t) => t.status === "RUNNING").length;
  const anyRunning = runningCount > 0;

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      await refresh(); // update this bar immediately
      router.refresh(); // and any open task page
    });

  return (
    <div className="shrink-0 border-t-2 border-emerald-500/60 bg-emerald-50/90 shadow-[0_-6px_24px_-8px_rgba(16,185,129,0.45)] backdrop-blur dark:bg-emerald-500/10">
      <div className="flex w-full items-center gap-3 px-6 py-3">
        <div
          className={
            "flex shrink-0 items-center gap-2 rounded-full px-3 py-1 ring-1 ring-inset " +
            (anyRunning ? "bg-emerald-500/15 ring-emerald-500/30" : "bg-amber-500/15 ring-amber-500/30")
          }
        >
          {anyRunning ? (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="flex size-2 rounded-full bg-amber-500" />
          )}
          <span
            className={
              "text-xs font-bold uppercase tracking-wide " +
              (anyRunning ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")
            }
          >
            {anyRunning ? `${runningCount} running` : `${timers.length} paused`}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {timers.map((t) => {
            const running = t.status === "RUNNING";
            const seconds = liveSeconds(t.status, t.baseSeconds, t.runStartedAtMs, now);
            return (
              <div
                key={t.taskId}
                className="flex shrink-0 items-center gap-2.5 rounded-xl bg-surface px-3 py-1.5 shadow-sm ring-1 ring-inset ring-emerald-500/25"
              >
                <span className={"flex size-2 rounded-full " + (running ? "animate-pulse bg-emerald-500" : "bg-amber-500")} />
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
                {running ? (
                  <button
                    onClick={() => act(() => pauseTimer(t.taskId))}
                    disabled={pending}
                    title="Pause timer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-300 transition-colors hover:bg-amber-200 active:scale-[0.97] disabled:opacity-50 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30 dark:hover:bg-amber-500/25"
                  >
                    <Icon name="pause" className="size-3.5" />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => act(() => startTimer(t.taskId))}
                    disabled={pending}
                    title="Resume timer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-inset ring-emerald-700/40 transition-colors hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-50"
                  >
                    <Icon name="play" className="size-3.5" fill="currentColor" stroke="none" />
                    Resume
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
