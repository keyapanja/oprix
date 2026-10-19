import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { sessionCan } from "@/lib/auth/guard";
import type { SessionUser } from "@/lib/auth/session";
import { hashToken } from "@/lib/vault/crypto";

/**
 * Who may use a project's credentials library, and whether this browser has
 * unlocked it. Every page and every action goes through here, on every
 * request — nothing is trusted from the browser, and losing access (a
 * deactivated login, an owner swapped out, a manager removing someone) takes
 * effect on the very next click, even mid-unlock.
 */

export type Purpose = "VIEW" | "EDIT";

export const CODE_MINUTES = 10;
export const CODE_ATTEMPTS = 5;
/** Codes one person may request, across both purposes: a few in any 15
 *  minutes (unlock + edit + a resend never trips it), and a daily ceiling so
 *  guessing stays hopeless — 20 codes × 5 tries is 100 guesses in a million. */
export const CODE_SENDS = { perWindow: 5, windowMin: 15, perDay: 20 } as const;

const COOKIE: Record<Purpose, string> = { VIEW: "oprix_vault", EDIT: "oprix_vault_edit" };

export function unlockCookieName(purpose: Purpose): string {
  return COOKIE[purpose];
}

export type VaultProject = { id: string; name: string; clientId: string | null };

/**
 * The project, if this person can use its library:
 * - a client's portal login → any project of their own client;
 * - Super Admins → every project;
 * - other staff → projects where they own a category (primary assignee of one
 *   of the project's services), or that a project manager added them to.
 *   A manager's word wins either way: a CredentialAccess row with
 *   allowed = false takes a category owner off this project's library.
 */
export async function vaultProject(session: SessionUser, projectId: string): Promise<VaultProject | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.companyId, deletedAt: null },
    select: { id: true, name: true, clientId: true },
  });
  if (!project) return null;

  if (session.role === "CLIENT") {
    return session.clientId && project.clientId === session.clientId ? project : null;
  }
  if (session.role === "SUPER_ADMIN") return project;
  if (!session.employeeId) return null;

  const [owns, say] = await Promise.all([
    prisma.projectService.count({ where: { projectId, primaryAssigneeId: session.employeeId } }),
    prisma.credentialAccess.findUnique({
      where: { projectId_employeeId: { projectId, employeeId: session.employeeId } },
      select: { allowed: true },
    }),
  ]);
  const allowed = say ? say.allowed : owns > 0;
  return allowed ? project : null;
}

/** Can this person change who has access? Staff with project:manage. */
export async function canManageVaultAccess(session: SessionUser): Promise<boolean> {
  return session.role !== "CLIENT" && (await sessionCan(session, "project:manage"));
}

/** Projects whose library this staff member can open, for the Credentials page. */
export async function vaultProjectsFor(session: SessionUser) {
  if (session.role === "CLIENT") return [];
  const where =
    session.role === "SUPER_ADMIN"
      ? { companyId: session.companyId, deletedAt: null }
      : session.employeeId
        ? {
            companyId: session.companyId,
            deletedAt: null,
            OR: [
              {
                services: { some: { primaryAssigneeId: session.employeeId } },
                credentialAccess: { none: { employeeId: session.employeeId, allowed: false } },
              },
              { credentialAccess: { some: { employeeId: session.employeeId, allowed: true } } },
            ],
          }
        : null;
  if (!where) return [];
  return prisma.project.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      client: { select: { name: true } },
      _count: { select: { credentials: true } },
    },
  });
}

/**
 * This browser's live unlock for the signed-in person, if any. The cookie is
 * only a random token; the row it hashes to has to belong to this user, match
 * the purpose, and be neither expired nor revoked.
 */
export async function readUnlock(session: SessionUser, purpose: Purpose): Promise<{ expiresAt: Date } | null> {
  const token = (await cookies()).get(COOKIE[purpose])?.value;
  if (!token) return null;
  const row = await prisma.vaultUnlock.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { userId: true, purpose: true, expiresAt: true, revokedAt: true },
  });
  if (!row || row.userId !== session.userId || row.purpose !== purpose) return null;
  if (row.revokedAt || row.expiresAt <= new Date()) return null;
  return { expiresAt: row.expiresAt };
}

/** "ac****@gowithepic.com" — enough to recognise the inbox, not to harvest it. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const keep = name.slice(0, Math.min(2, name.length));
  return `${keep}${"*".repeat(Math.max(2, name.length - keep.length))}@${domain}`;
}
