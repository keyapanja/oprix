import "server-only";
import { startTimerFor, pauseTimerFor, stopTimerFor } from "@/lib/timer/core";
import { getActiveTasksFor } from "@/lib/ext/tasks";
import { withExtAuth, preflight } from "@/lib/ext/handler";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

// Control the user's timer on a task: { action: "start" | "pause" | "stop" }.
// Returns the refreshed active feed so the client can reconcile in one round trip.
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withExtAuth(req, async (session) => {
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const action = (body as { action?: string } | null)?.action;

    let res: { ok?: boolean; error?: string };
    if (action === "start") res = await startTimerFor(session, id);
    else if (action === "pause") res = await pauseTimerFor(session, id);
    else if (action === "stop") res = await stopTimerFor(session, id);
    else throw new Error("Invalid action — expected start, pause, or stop");

    if (res.error) throw new Error(res.error);
    return getActiveTasksFor(session);
  });
}
