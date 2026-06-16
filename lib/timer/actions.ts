"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { startTimerFor, pauseTimerFor } from "@/lib/timer/core";
import { getActiveTimers } from "@/lib/timer/data";
import type { ActiveTimer } from "@/lib/timer/shared";

// Thin cookie-session wrappers over the shared timer core (lib/timer/core.ts).
// The core holds the business logic so the extension API can reuse it; these
// add web-only revalidation.

export type TimerState = { ok?: boolean; error?: string };

function revalidateTimer(taskId: string) {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
}

export async function startTimer(taskId: string): Promise<TimerState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const res = await startTimerFor(session, taskId);
  if (res.ok) revalidateTimer(taskId);
  return res;
}

export async function pauseTimer(taskId: string): Promise<TimerState> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  const res = await pauseTimerFor(session, taskId);
  if (res.ok) revalidateTimer(taskId);
  return res;
}

/** The current user's active timers — polled by the global bar so changes made
 *  elsewhere (the browser extension, another tab/device) show without a reload. */
export async function getMyActiveTimers(): Promise<ActiveTimer[]> {
  const session = await getSession();
  if (!session) return [];
  return getActiveTimers(session.userId);
}
