import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Action } from "@/lib/auth/can";

/** For pages: redirects to /login (no session) or /dashboard (no capability). */
export async function requirePage(action?: Action): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/logout");
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
