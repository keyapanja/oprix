import type { ExtTask } from "@/shared/ext-contract";

/**
 * Dock order: what you're working on, then what's closest to being late.
 *
 *  1. **In Progress** rises to the top — it's the work actually underway.
 *  2. then **soonest due first**, which puts anything overdue above everything.
 *  3. undated tasks sink; there's nothing urgent about a task with no deadline.
 *
 * Returning 0 leaves the pair in the query's order (createdAt), and `Array#sort`
 * is stable, so equal-urgency tasks keep a fixed, predictable position.
 *
 * Timer state is deliberately absent: pausing and resuming must never move a
 * task, or the row shifts under the cursor as you click it. A *status* change
 * does reorder — that's the point — which includes starting a timer, since that
 * moves To Do / Redo into In Progress (lib/timer/core.ts). The task you just
 * started jumping to the top is the behaviour people expect.
 *
 * Lives apart from lib/ext/tasks.ts, which is `server-only`: this is pure policy
 * over the shared contract, with nothing to hide and nothing to connect to.
 */
export function byUrgency(a: ExtTask, b: ExtTask): number {
  const underway = Number(b.status === "IN_PROGRESS") - Number(a.status === "IN_PROGRESS");
  if (underway !== 0) return underway;
  if (a.dueDate === b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  // "YYYY-MM-DD", so a plain string compare is a date compare.
  return a.dueDate < b.dueDate ? -1 : 1;
}
