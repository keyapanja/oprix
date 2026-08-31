"use client";

// Client-only bridge between the TimerBar and the topbar's sign-out button.
//
// The TimerBar already owns the live poll of the current user's timers, so it
// publishes the names of anything RUNNING here. The sign-out handler reads them
// once, at click time, to decide whether to warn — no second poll, no context
// provider, and no re-render when the value changes.
//
// Never import this from a server component: module-level state on the server
// is shared across requests and would leak one user's timers into another's.

let runningTimerNames: string[] = [];

/** Called by the TimerBar whenever its RUNNING set changes (and on unmount). */
export function setRunningTimerNames(names: string[]): void {
  runningTimerNames = names;
}

/** Task names currently being timed for this user. Empty when nothing runs. */
export function getRunningTimerNames(): string[] {
  return runningTimerNames;
}
