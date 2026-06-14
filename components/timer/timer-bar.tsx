"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { pauseTimer } from "@/lib/timer/actions";
import { Icon } from "@/components/ui/icons";
import { fmtClock, liveSeconds, type ActiveTimer } from "@/lib/timer/shared";

export function TimerBar({ timers }: { timers: ActiveTimer[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState<number | null>(null);

  // One shared 1s tick for the whole bar; null pre-mount avoids hydration drift.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (timers.length === 0) return null;

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="shrink-0 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-2.5">
        <div className="flex shrink-0 items-center gap-2 pr-1">
          <Icon name="clock" className="size-4 text-accent-strong" />
          <span className="text-xs font-semibold text-content">{timers.length} running</span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {timers.map((t) => {
            const seconds = liveSeconds("RUNNING", t.baseSeconds, t.runStartedAtMs, now);
            return (
              <div
                key={t.taskId}
                className="flex shrink-0 items-center gap-2.5 rounded-xl bg-canvas px-3 py-1.5 ring-1 ring-inset ring-line"
              >
                <span className="flex size-2 animate-pulse rounded-full bg-emerald-500" />
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
                <button
                  onClick={() => act(() => pauseTimer(t.taskId))}
                  disabled={pending}
                  title="Pause"
                  className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-content disabled:opacity-50"
                >
                  <Icon name="pause" className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
