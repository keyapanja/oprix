import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import type { Action } from "@/lib/auth/can";

/** Does this employee head any department? (Memoized per request.) */
const isDeptHead = cache(async (companyId: string, employeeId: string): Promise<boolean> => {
  return (await prisma.department.count({ where: { companyId, headId: employeeId } })) > 0;
});

/**
 * Whether the signed-in user has a capability — via their own role, OR (for
 * department heads) via the "Department Head" access bucket, stored internally
 * under the retired TEAM_LEAD slot. This only ADDS access on top of the role;
 * it never removes a role's own grant.
 */
export async function sessionCan(session: SessionUser, action: Action): Promise<boolean> {
  if (await hasPermission(session.companyId, session.role, action)) return true;
  if (session.employeeId && (await isDeptHead(session.companyId, session.employeeId))) {
    return hasPermission(session.companyId, "TEAM_LEAD", action);
  }
  return false;
}

/** For pages: redirects to /login (no session) or /dashboard (no capability). */
export async function requirePage(action?: Action): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/logout");
  if (action && !(await sessionCan(session, action))) {
    redirect("/dashboard");
  }
  return session;
}

/** For server actions: throws instead of redirecting. */
export async function requireCapability(action: Action): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (!(await sessionCan(session, action))) {
    throw new Error("Not authorized");
  }
  return session;
}

/** Session guaranteed to be a CLIENT-role user scoped to a client. */
export type PortalSession = SessionUser & { clientId: string };

/**
 * For client-portal pages: requires a CLIENT-role user with a clientId.
 * Returns the session narrowed so clientId is non-null — every portal query
 * scopes to it. Non-clients are bounced to the internal app.
 */
export async function requirePortal(): Promise<PortalSession> {
  const session = await getSession();
  if (!session) redirect("/logout");
  if (session.role !== "CLIENT" || !session.clientId) redirect("/dashboard");
  return session as PortalSession;
}

/** For portal server actions: throws instead of redirecting. */
export async function requirePortalAction(): Promise<PortalSession> {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.clientId) {
    throw new Error("Not authorized");
  }
  return session as PortalSession;
}
