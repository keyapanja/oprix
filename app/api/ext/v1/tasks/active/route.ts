import "server-only";
import { getActiveTasksFor } from "@/lib/ext/tasks";
import { withExtAuth, preflight } from "@/lib/ext/handler";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

// The user's running + paused tasks with checklist, related KB, and timer state.
export function GET(req: Request) {
  return withExtAuth(req, (session) => getActiveTasksFor(session));
}
