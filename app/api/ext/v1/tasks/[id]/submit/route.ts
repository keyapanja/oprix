import "server-only";
import { submitForReviewFor } from "@/lib/tasks/workflow-core";
import { getActiveTasksFor } from "@/lib/ext/tasks";
import { withExtAuth, preflight } from "@/lib/ext/handler";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

// Submit a task for review: { finalLink }. On success the task moves to REVIEW
// and drops out of the (work-state) feed — the response is the refreshed feed.
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withExtAuth(req, async (session) => {
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const finalLink = String((body as { finalLink?: string } | null)?.finalLink ?? "");
    const res = await submitForReviewFor(session, id, finalLink);
    if (res.error) throw new Error(res.error);
    return getActiveTasksFor(session);
  });
}
