// Isomorphic timer helpers — safe to import from both server and client.

export type TimerStatusUI = "RUNNING" | "PAUSED" | "NONE";

/** Per-task timer state for the current employee (used by list + detail controls). */
export type TaskTimerState = {
  status: TimerStatusUI;
  baseSeconds: number;
  runStartedAtMs: number | null;
};

export type ActiveTimer = {
  taskId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  status: "RUNNING" | "PAUSED";
  baseSeconds: number; // time banked before the current run
  runStartedAtMs: number | null; // epoch ms of the current run; null while paused
};

/** Live elapsed seconds for a timer given the current epoch ms (null = pre-mount). */
export function liveSeconds(
  status: TimerStatusUI,
  baseSeconds: number,
  runStartedAtMs: number | null,
  nowMs: number | null,
): number {
  if (status === "RUNNING" && runStartedAtMs && nowMs) {
    return baseSeconds + Math.max(0, Math.floor((nowMs - runStartedAtMs) / 1000));
  }
  return baseSeconds;
}

/** Stopwatch format: "1:05:09" with hours, "5:09" without. */
export function fmtClock(totalSeconds: number): string {
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Short human duration for log messages: "45s", "12m", "1h 3m". */
export function fmtDurationShort(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Coarse total: "1h 23m", "12m", or "0m". */
export function fmtHm(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
