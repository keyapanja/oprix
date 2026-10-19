import "server-only";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { getCompanyTimezone } from "@/lib/cache";
import { formatDateTime } from "@/lib/format";
import { aad, decrypt, vaultConfigured } from "@/lib/vault/crypto";
import { canManageVaultAccess, maskEmail, readUnlock, vaultProject } from "@/lib/vault/access";

/**
 * What one viewer's credentials section shows. Entries carry the title and
 * the login URL only — usernames, passwords and notes are fetched one entry
 * at a time by revealCredential, so they're never in the page HTML.
 */
export type VaultEntry = { id: string; title: string; url: string | null; updated: string };
export type VaultHistoryRow = { id: string; actor: string; action: string; at: string };
export type VaultAccessInfo = {
  automatic: { name: string; why: string }[];
  added: { employeeId: string; name: string }[];
  candidates: { id: string; name: string }[];
};
export type VaultView = {
  projectId: string;
  configured: boolean;
  /** Can open this project's library (the gate every action re-checks). */
  hasAccess: boolean;
  canManageAccess: boolean;
  emailHint: string;
  viewMinutes: number;
  editMinutes: number;
  /** Set while this browser is unlocked: ISO, and "3:42 pm" in company time. */
  viewUntil: string | null;
  viewUntilLabel: string | null;
  editUntil: string | null;
  editUntilLabel: string | null;
  count: number;
  /** null while locked. */
  entries: VaultEntry[] | null;
  history: VaultHistoryRow[] | null;
  /** Only for people who can change access. */
  access: VaultAccessInfo | null;
};

/** null = this person has no business seeing the section at all. */
export async function loadVault(session: SessionUser, projectId: string): Promise<VaultView | null> {
  const [project, canManage] = await Promise.all([vaultProject(session, projectId), canManageVaultAccess(session)]);
  if (!project && !canManage) return null;

  const configured = vaultConfigured();
  const [me, company, tz, count, view, edit] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } }),
    prisma.company.findUnique({
      where: { id: session.companyId },
      select: { vaultViewMinutes: true, vaultEditMinutes: true },
    }),
    getCompanyTimezone(session.companyId),
    prisma.credential.count({ where: { projectId } }),
    project && configured ? readUnlock(session, "VIEW") : null,
    project && configured ? readUnlock(session, "EDIT") : null,
  ]);
  const clock = (d: Date) =>
    d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz });

  let entries: VaultEntry[] | null = null;
  let history: VaultHistoryRow[] | null = null;
  if (project && view) {
    const [rows, logs] = await Promise.all([
      prisma.credential.findMany({
        where: { projectId },
        orderBy: { title: "asc" },
        select: { id: true, title: true, urlCipher: true, updatedAt: true, createdById: true, updatedById: true },
      }),
      prisma.activityLog.findMany({
        where: { companyId: session.companyId, entityType: "CREDENTIALS", entityId: projectId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, action: true, meta: true, createdAt: true },
      }),
    ]);
    const names = await namesOf(rows.map((r) => r.updatedById ?? r.createdById));
    entries = rows.map((r) => {
      let url: string | null = null;
      try {
        url = r.urlCipher ? decrypt(r.urlCipher, aad(projectId, r.id, "url")) : null;
      } catch {
        url = null;
      }
      const who = names.get(r.updatedById ?? r.createdById) ?? "Someone";
      return { id: r.id, title: r.title, url, updated: `${who} · ${formatDateTime(r.updatedAt, tz)}` };
    });
    history = logs.map((l) => ({
      id: l.id,
      actor: (l.meta as { actor?: string } | null)?.actor ?? "Someone",
      action: l.action,
      at: formatDateTime(l.createdAt, tz),
    }));
  }

  return {
    projectId,
    configured,
    hasAccess: !!project,
    canManageAccess: canManage,
    emailHint: me ? maskEmail(me.email) : "your email",
    viewMinutes: company?.vaultViewMinutes ?? 30,
    editMinutes: company?.vaultEditMinutes ?? 10,
    viewUntil: view ? view.expiresAt.toISOString() : null,
    viewUntilLabel: view ? clock(view.expiresAt) : null,
    editUntil: view && edit ? edit.expiresAt.toISOString() : null,
    editUntilLabel: view && edit ? clock(edit.expiresAt) : null,
    count,
    entries,
    history,
    access: canManage ? await accessInfo(session.companyId, projectId) : null,
  };
}

/** Display names: staff by employee name; a client by their portal name, else email. */
async function namesOf(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, nickname: true, role: true, employee: { select: { fullName: true } } },
  });
  return new Map(
    users.map((u) => [
      u.id,
      u.employee?.fullName ?? (u.role === "CLIENT" ? u.nickname?.trim() || u.email : u.nickname?.trim() || "Team"),
    ]),
  );
}

async function accessInfo(companyId: string, projectId: string): Promise<VaultAccessInfo> {
  const [owners, added, employees] = await Promise.all([
    prisma.projectService.findMany({
      where: { projectId, primaryAssigneeId: { not: null } },
      select: { service: { select: { name: true } }, primaryAssignee: { select: { id: true, fullName: true } } },
    }),
    prisma.credentialAccess.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { employee: { select: { id: true, fullName: true } } },
    }),
    // Only people who can sign in are worth adding.
    prisma.employee.findMany({
      where: { companyId, deletedAt: null, user: { isNot: null } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  const byOwner = new Map<string, { name: string; categories: string[] }>();
  for (const o of owners) {
    if (!o.primaryAssignee) continue;
    const cur = byOwner.get(o.primaryAssignee.id) ?? { name: o.primaryAssignee.fullName, categories: [] };
    cur.categories.push(o.service.name);
    byOwner.set(o.primaryAssignee.id, cur);
  }
  const taken = new Set([...byOwner.keys(), ...added.map((a) => a.employee.id)]);

  return {
    automatic: [
      { name: "Super Admins", why: "Always" },
      ...[...byOwner.values()].map((o) => ({ name: o.name, why: `Owns ${o.categories.join(", ")}` })),
    ],
    added: added.map((a) => ({ employeeId: a.employee.id, name: a.employee.fullName })),
    candidates: employees.filter((e) => !taken.has(e.id)).map((e) => ({ id: e.id, name: e.fullName })),
  };
}
