import "server-only";
import { toggleChecklistItemFor } from "@/lib/projects/task-access";
import { withExtAuth, preflight } from "@/lib/ext/handler";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

// Toggle a checklist item: { isDone: boolean }.
export function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  return withExtAuth(req, async (session) => {
    const { itemId } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const isDone = !!(body as { isDone?: boolean } | null)?.isDone;
    const res = await toggleChecklistItemFor(session, itemId, isDone);
    if (res.error) throw new Error(res.error);
    return { ok: true, taskId: res.taskId, isDone };
  });
}
