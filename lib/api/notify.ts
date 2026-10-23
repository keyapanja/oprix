import "server-only";
import { prisma } from "@/lib/db";
import { appUrl, sendApiConnectionEmail } from "@/lib/email";

/**
 * Tell the client a new way into their account exists — a key created or an
 * app approved. Sent to the login it acts as (the primary contact). Best-effort:
 * a mail outage must not undo the connection, so failures are only logged.
 */
export async function notifyNewConnection(connectionId: string): Promise<void> {
  try {
    const c = await prisma.apiConnection.findUnique({
      where: { id: connectionId },
      select: {
        name: true,
        kind: true,
        canWrite: true,
        projectIds: true,
        user: { select: { email: true, nickname: true } },
      },
    });
    if (!c) return;
    const projects = c.projectIds.length
      ? (await prisma.project.findMany({ where: { id: { in: c.projectIds } }, select: { name: true } }))
          .map((p) => p.name)
          .join(", ")
      : "All projects";
    await sendApiConnectionEmail({
      to: c.user.email,
      name: c.user.nickname?.trim() || "there",
      connectionName: c.name,
      kind: c.kind === "OAUTH" ? "OAUTH" : "KEY",
      access: c.canWrite ? "Read and change" : "Read only",
      projects,
      manageUrl: appUrl("/portal/connect"),
    });
  } catch (e) {
    console.error("[api] new-connection email failed:", e);
  }
}
