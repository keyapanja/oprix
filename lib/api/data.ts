import "server-only";
import { prisma } from "@/lib/db";
import { getCompanyTimezone } from "@/lib/cache";
import { formatDateTime } from "@/lib/format";
import { primaryContactId } from "@/lib/api/auth";

/** What each tool did, in words, for the activity list. */
const TOOL_WORDS: Record<string, string> = {
  list_projects: "Listed projects",
  get_project: "Opened a project",
  list_tasks: "Listed tasks",
  get_task: "Opened a task",
  list_reviews: "Checked items to review",
  list_deliverables: "Listed deliverables",
  get_attachment: "Opened an attachment",
  create_task: "Raised a request",
  update_task: "Edited a request",
  add_comment: "Commented",
  approve_task: "Approved a request",
  request_task_changes: "Sent a request back",
  approve_deliverable: "Approved a deliverable",
  request_deliverable_changes: "Sent a deliverable back",
};

export type ConnectionRow = {
  id: string;
  kind: "KEY" | "OAUTH";
  name: string;
  keyPrefix: string | null;
  access: string;
  projects: string;
  status: "active" | "expired" | "revoked";
  created: string;
  expires: string;
  lastUsed: string | null;
};

export type ActivityRow = { id: string; at: string; connection: string; what: string; ok: boolean; error: string | null };

export type ApiAccountView = {
  enabled: boolean;
  primaryName: string | null;
  connections: ConnectionRow[];
  activity: ActivityRow[];
  projects: { id: string; name: string }[];
};

/** A client account's API connections and recent activity — for its own portal page and for the team. */
export async function apiAccountView(clientId: string, companyId: string): Promise<ApiAccountView> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [client, primaryId, rows, logs, projects, tz] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, companyId }, select: { apiEnabled: true } }),
    primaryContactId(clientId, companyId),
    prisma.apiConnection.findMany({
      where: { clientId, companyId, OR: [{ revokedAt: null }, { revokedAt: { gte: since } }] },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.apiCallLog.findMany({
      where: { clientId, companyId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.project.findMany({
      where: { clientId, companyId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getCompanyTimezone(companyId),
  ]);
  const primary = primaryId
    ? await prisma.user.findUnique({ where: { id: primaryId }, select: { email: true, nickname: true } })
    : null;
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const connName = new Map(rows.map((r) => [r.id, r.name]));
  const now = new Date();

  return {
    enabled: !!client?.apiEnabled,
    primaryName: primary ? primary.nickname?.trim() || primary.email : null,
    connections: rows.map((r) => ({
      id: r.id,
      kind: r.kind === "OAUTH" ? "OAUTH" : "KEY",
      name: r.name,
      keyPrefix: r.keyPrefix,
      access: r.canWrite ? "Read and change" : "Read only",
      projects: r.projectIds.length ? r.projectIds.map((id) => projectName.get(id) ?? "a removed project").join(", ") : "All projects",
      status: r.revokedAt ? "revoked" : r.expiresAt <= now ? "expired" : "active",
      created: formatDateTime(r.createdAt, tz),
      expires: formatDateTime(r.expiresAt, tz),
      lastUsed: r.lastUsedAt ? `${formatDateTime(r.lastUsedAt, tz)}${r.lastUsedIp ? ` · ${r.lastUsedIp}` : ""}` : null,
    })),
    activity: logs.map((l) => ({
      id: l.id,
      at: formatDateTime(l.createdAt, tz),
      connection: connName.get(l.connectionId) ?? "An older connection",
      what: TOOL_WORDS[l.tool] ?? l.tool,
      ok: l.ok,
      error: l.error,
    })),
    projects,
  };
}
