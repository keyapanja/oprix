import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Action } from "@/lib/auth/can";

/** For pages: redirects to /login (no session) or /dashboard (no capability). */
export async function requirePage(action?: Action): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (action && !(await hasPermission(session.companyId, session.role, action))) {
    redirect("/dashboard");
  }
  return session;
}

/** For server actions: throws instead of redirecting. */
export async function requireCapability(action: Action): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (!(await hasPermission(session.companyId, session.role, action))) {
    throw new Error("Not authorized");
  }
  return session;
}
