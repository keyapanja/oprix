"use client";

import { useEffect, useState } from "react";
import { liveSeconds, fmtClock } from "@/lib/timer/shared";
import type { TaskRunner } from "@/lib/timer/data";

/**
 * Live "who's working right now" panel, visible to every task viewer. Ticks each
 * second from each runner's runStartedAtMs; the page's LiveRefresh re-fetches the
 * set of runners periodically so newly started/stopped timers appear.
 */
export function TaskLiveTimers({ runners }: { runners: TaskRunner[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (runners.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5 rounded-xl bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25">
      {runners.map((r) => (
        <div key={r.userId} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="truncate">{r.name} is working</span>
          </span>
          <span className="shrink-0 font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {fmtClock(liveSeconds("RUNNING", r.baseSeconds, r.runStartedAtMs, now))}
          </span>
        </div>
      ))}
    </div>
  );
}
