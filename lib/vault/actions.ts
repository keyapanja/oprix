"use server";

import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { sessionCan } from "@/lib/auth/guard";
import { logActivity, actorLabel } from "@/lib/activity";
import { sendVaultCodeEmail } from "@/lib/email";
import {
  aad,
  decrypt,
  encrypt,
  hashCode,
  hashToken,
  newCode,
  newToken,
  sameDigest,
  vaultConfigured,
} from "@/lib/vault/crypto";
import {
  CODE_ATTEMPTS,
  CODE_MINUTES,
  CODE_SENDS,
  canManageVaultAccess,
  maskEmail,
  readUnlock,
  unlockCookieName,
  vaultProject,
  type Purpose,
  type VaultProject,
} from "@/lib/vault/access";

// Every export here is a callable endpoint, so each one re-checks the session,
// the project access and the unlock itself. Secret values are only ever
// returned by revealCredential, one entry at a time, and are never logged,
// put in an error message, a notification or the history.

export type VaultResult = { ok?: boolean; error?: string; locked?: boolean; needEdit?: boolean };
export type Secrets = { username: string; password: string; notes: string };

const NOT_SET_UP = "The credentials library isn't set up yet — an admin needs to add its encryption key.";
const PurposeZ = z.enum(["VIEW", "EDIT"]);

// ---- Codes and unlocking -----------------------------------------------------

/** Email a 6-digit code to the signed-in person's own address. */
export async function sendVaultCode(purpose: Purpose): Promise<VaultResult & { sentTo?: string }> {
  const session = await getSession();
  if (!session) return { error: "You're not signed in." };
  const p = PurposeZ.safeParse(purpose);
  if (!p.success) return { error: "Invalid request." };
  if (!vaultConfigured()) return { error: NOT_SET_UP };

  const now = Date.now();
  const [recent, today] = await Promise.all([
    prisma.vaultCode.count({
      where: { userId: session.userId, createdAt: { gte: new Date(now - CODE_SENDS.windowMin * 60_000) } },
    }),
    prisma.vaultCode.count({ where: { userId: session.userId, createdAt: { gte: new Date(now - 86_400_000) } } }),
  ]);
  if (recent >= CODE_SENDS.perWindow || today >= CODE_SENDS.perDay) {
    return { error: "Too many codes requested. Wait a few minutes and try again." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, nickname: true, employee: { select: { fullName: true } } },
  });
  if (!user) return { error: "You're not signed in." };

  // Only the newest code works, and old rows don't pile up. Codes are kept a
  // couple of days because the daily cap above counts them.
  await prisma.$transaction([
    prisma.vaultCode.updateMany({
      where: { userId: session.userId, purpose: p.data, usedAt: null },
      data: { usedAt: new Date(now) },
    }),
    prisma.vaultCode.deleteMany({ where: { userId: session.userId, createdAt: { lt: new Date(now - 2 * 86_400_000) } } }),
    prisma.vaultUnlock.deleteMany({ where: { userId: session.userId, expiresAt: { lt: new Date(now - 86_400_000) } } }),
  ]);

  const id = randomUUID();
  const code = newCode();
  await prisma.vaultCode.create({
    data: {
      id,
      userId: session.userId,
      purpose: p.data,
      codeHash: hashCode(id, code),
      expiresAt: new Date(now + CODE_MINUTES * 60_000),
    },
  });

  try {
    await sendVaultCodeEmail({
      to: user.email,
      name: user.employee?.fullName ?? (user.nickname?.trim() || "there"),
      code,
      minutes: CODE_MINUTES,
      purpose: p.data,
    });
  } catch {
    await prisma.vaultCode.delete({ where: { id } }).catch(() => {});
    return { error: "We couldn't send the email. Try again in a moment." };
  }
  return { ok: true, sentTo: maskEmail(user.email) };
}

/** Check a code; on success this browser is unlocked for the company's window. */
export async function verifyVaultCode(purpose: Purpose, code: string): Promise<VaultResult> {
  const session = await getSession();
  if (!session) return { error: "You're not signed in." };
  const p = PurposeZ.safeParse(purpose);
  if (!p.success) return { error: "Invalid request." };
  if (!vaultConfigured()) return { error: NOT_SET_UP };

  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length !== 6) return { error: "Enter the 6-digit code from the email." };

  const row = await prisma.vaultCode.findFirst({
    where: { userId: session.userId, purpose: p.data, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true },
  });
  if (!row) return { error: "That code has expired. Send a new one." };

  // Count the try before checking it, in one guarded write, so guesses sent in
  // parallel can't slip past the limit.
  const counted = await prisma.vaultCode.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return { error: "Too many wrong tries. Send a new code." };

  if (!sameDigest(hashCode(row.id, digits), row.codeHash)) {
    const left = CODE_ATTEMPTS - (row.attempts + 1);
    return {
      error: left > 0 ? `That code isn't right — ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Send a new code.",
    };
  }

  // Burn it: a code works once, even if two tabs submit it together.
  const burned = await prisma.vaultCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (burned.count !== 1) return { error: "That code was already used. Send a new one." };

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { vaultViewMinutes: true, vaultEditMinutes: true },
  });
  const minutes = p.data === "EDIT" ? (company?.vaultEditMinutes ?? 10) : (company?.vaultViewMinutes ?? 30);
  await startUnlock(session, p.data, minutes);
  return { ok: true };
}

async function startUnlock(session: SessionUser, purpose: Purpose, minutes: number) {
  const jar = await cookies();
  const name = unlockCookieName(purpose);
  const previous = jar.get(name)?.value;
  if (previous) {
    await prisma.vaultUnlock.updateMany({
      where: { tokenHash: hashToken(previous), userId: session.userId },
      data: { revokedAt: new Date() },
    });
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  await prisma.vaultUnlock.create({
    data: { userId: session.userId, purpose, tokenHash: hashToken(token), expiresAt },
  });
  // httpOnly: page scripts can't read it. strict: never sent on a request that
  // starts on another site.
  jar.set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

/** Lock this browser now: both unlocks are revoked server-side, not just forgotten. */
export async function lockVault(): Promise<VaultResult> {
  const session = await getSession();
  if (!session) return { ok: true };
  const jar = await cookies();
  for (const purpose of ["VIEW", "EDIT"] as const) {
    const name = unlockCookieName(purpose);
    const token = jar.get(name)?.value;
    if (token) {
      await prisma.vaultUnlock.updateMany({
        where: { tokenHash: hashToken(token), userId: session.userId },
        data: { revokedAt: new Date() },
      });
    }
    jar.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
  }
  return { ok: true };
}

// ---- Entries -------------------------------------------------------------------

type Opened = { session: SessionUser; project: VaultProject };

/** Signed in, set up, allowed on this project, unlocked — and for changes, the second check too. */
async function openLibrary(projectId: string, edit: boolean): Promise<Opened | { fail: VaultResult }> {
  const session = await getSession();
  if (!session) return { fail: { error: "You're not signed in." } };
  if (!vaultConfigured()) return { fail: { error: NOT_SET_UP } };
  const project = await vaultProject(session, projectId);
  if (!project) return { fail: { error: "You don't have access to this library." } };
  if (!(await readUnlock(session, "VIEW"))) return { fail: { error: "The library has locked.", locked: true } };
  if (edit && !(await readUnlock(session, "EDIT"))) {
    return { fail: { error: "Confirm it's you to make changes.", needEdit: true } };
  }
  return { session, project };
}

function parseSecrets(json: string): Secrets {
  const v = JSON.parse(json) as Partial<Secrets>;
  return { username: String(v.username ?? ""), password: String(v.password ?? ""), notes: String(v.notes ?? "") };
}

/** One entry's username, password and notes — the only place they leave the server. */
export async function revealCredential(id: string): Promise<VaultResult & { values?: Secrets }> {
  const session = await getSession();
  if (!session) return { error: "You're not signed in." };
  const row = await prisma.credential.findFirst({
    where: { id: String(id), companyId: session.companyId },
    select: { id: true, projectId: true, secretCipher: true },
  });
  if (!row) return { error: "That entry no longer exists." };
  const opened = await openLibrary(row.projectId, false);
  if ("fail" in opened) return opened.fail;
  try {
    return { ok: true, values: parseSecrets(decrypt(row.secretCipher, aad(row.projectId, row.id, "secret"))) };
  } catch {
    return { error: "This entry couldn't be decrypted." };
  }
}

const EntryZ = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Give it a title.").max(120, "Keep the title under 120 characters."),
  url: z.string().trim().max(2000, "That URL is too long."),
  username: z.string().trim().max(500, "The username is too long."),
  // Not trimmed: a space can be part of a password.
  password: z.string().max(2000, "The password is too long."),
  notes: z.string().trim().max(5000, "The notes are too long."),
});
export type EntryInput = z.input<typeof EntryZ>;

/** "example.com/wp-admin" → "https://example.com/wp-admin"; anything but http(s) is refused. */
function normaliseUrl(raw: string): string | null | false {
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? withScheme : false;
  } catch {
    return false;
  }
}

/** "a", "a and b", "a, b and c". */
function listWords(words: string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** Add a new entry, or save changes to one. Needs the second (edit) check. */
export async function saveCredential(input: EntryInput): Promise<VaultResult> {
  const parsed = EntryZ.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const data = parsed.data;
  const url = normaliseUrl(data.url);
  if (url === false) return { error: "The login URL should be a web address (https://…)." };

  const opened = await openLibrary(data.projectId, true);
  if ("fail" in opened) return opened.fail;
  const { session, project } = opened;

  const secrets: Secrets = { username: data.username, password: data.password, notes: data.notes };
  let message: string;

  if (data.id) {
    const old = await prisma.credential.findFirst({
      where: { id: data.id, projectId: project.id },
      select: { id: true, title: true, urlCipher: true, secretCipher: true },
    });
    if (!old) return { error: "That entry no longer exists." };

    // Which fields changed — named in the history, their values never are.
    let before: (Secrets & { url: string | null }) | null = null;
    try {
      before = {
        ...parseSecrets(decrypt(old.secretCipher, aad(project.id, old.id, "secret"))),
        url: old.urlCipher ? decrypt(old.urlCipher, aad(project.id, old.id, "url")) : null,
      };
    } catch {
      before = null; // unreadable before → everything counts as changed
    }
    const changed = [
      ["login URL", before?.url !== url],
      ["username", before?.username !== secrets.username],
      ["password", before?.password !== secrets.password],
      ["notes", before?.notes !== secrets.notes],
    ]
      .filter(([, diff]) => diff)
      .map(([name]) => name as string);
    const renamed = old.title !== data.title;
    if (!renamed && !changed.length) return { ok: true };

    await prisma.credential.update({
      where: { id: old.id },
      data: {
        title: data.title,
        urlCipher: url ? encrypt(url, aad(project.id, old.id, "url")) : null,
        secretCipher: encrypt(JSON.stringify(secrets), aad(project.id, old.id, "secret")),
        updatedById: session.userId,
      },
    });
    message = renamed
      ? `renamed “${old.title}” to “${data.title}”${changed.length ? ` and changed its ${listWords(changed)}` : ""}`
      : `changed the ${listWords(changed)} of “${data.title}”`;
  } else {
    const id = randomUUID();
    await prisma.credential.create({
      data: {
        id,
        companyId: session.companyId,
        projectId: project.id,
        title: data.title,
        urlCipher: url ? encrypt(url, aad(project.id, id, "url")) : null,
        secretCipher: encrypt(JSON.stringify(secrets), aad(project.id, id, "secret")),
        createdById: session.userId,
      },
    });
    message = `added “${data.title}”`;
  }

  await logVault(session, project.id, message);
  refresh(project.id);
  return { ok: true };
}

/** Delete an entry for good — the ciphertext goes too. Needs the edit check. */
export async function deleteCredential(id: string): Promise<VaultResult> {
  const session = await getSession();
  if (!session) return { error: "You're not signed in." };
  const row = await prisma.credential.findFirst({
    where: { id: String(id), companyId: session.companyId },
    select: { id: true, projectId: true, title: true },
  });
  if (!row) return { error: "That entry no longer exists." };
  const opened = await openLibrary(row.projectId, true);
  if ("fail" in opened) return opened.fail;

  await prisma.credential.delete({ where: { id: row.id } });
  await logVault(opened.session, row.projectId, `deleted “${row.title}”`);
  refresh(row.projectId);
  return { ok: true };
}

// ---- Who has access ------------------------------------------------------------

async function openAccess(projectId: string): Promise<{ session: SessionUser; projectId: string } | { fail: VaultResult }> {
  const session = await getSession();
  if (!session) return { fail: { error: "You're not signed in." } };
  if (!(await canManageVaultAccess(session))) return { fail: { error: "Only project managers can change who has access." } };
  if (!vaultConfigured()) return { fail: { error: NOT_SET_UP } };
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!project) return { fail: { error: "Project not found." } };
  if (!(await readUnlock(session, "EDIT"))) return { fail: { error: "Confirm it's you to make changes.", needEdit: true } };
  return { session, projectId: project.id };
}

export async function grantVaultAccess(projectId: string, employeeId: string): Promise<VaultResult> {
  const opened = await openAccess(String(projectId));
  if ("fail" in opened) return opened.fail;
  const emp = await prisma.employee.findFirst({
    where: { id: String(employeeId), companyId: opened.session.companyId, deletedAt: null },
    select: { id: true, fullName: true },
  });
  if (!emp) return { error: "Employee not found." };

  const existing = await prisma.credentialAccess.findUnique({
    where: { projectId_employeeId: { projectId: opened.projectId, employeeId: emp.id } },
    select: { id: true },
  });
  if (existing) return { ok: true };
  await prisma.credentialAccess.create({
    data: { projectId: opened.projectId, employeeId: emp.id, grantedById: opened.session.userId },
  });
  await logVault(opened.session, opened.projectId, `gave ${emp.fullName} access`);
  refresh(opened.projectId);
  return { ok: true };
}

export async function revokeVaultAccess(projectId: string, employeeId: string): Promise<VaultResult> {
  const opened = await openAccess(String(projectId));
  if ("fail" in opened) return opened.fail;
  const row = await prisma.credentialAccess.findUnique({
    where: { projectId_employeeId: { projectId: opened.projectId, employeeId: String(employeeId) } },
    select: { id: true, employee: { select: { fullName: true } } },
  });
  if (!row) return { ok: true };
  await prisma.credentialAccess.delete({ where: { id: row.id } });
  await logVault(opened.session, opened.projectId, `removed ${row.employee.fullName}'s access`);
  refresh(opened.projectId);
  return { ok: true };
}

// ---- Settings ------------------------------------------------------------------

const WindowsZ = z.object({
  viewMinutes: z.number().int().min(5, "Unlock for at least 5 minutes.").max(240, "Unlock for at most 4 hours."),
  editMinutes: z.number().int().min(1, "Allow changes for at least 1 minute.").max(60, "Allow changes for at most 60 minutes."),
});

/** How long an unlock and an edit check last. Admins only. */
export async function setVaultWindows(input: { viewMinutes: number; editMinutes: number }): Promise<VaultResult> {
  const session = await getSession();
  if (!session || !(await sessionCan(session, "org:manage"))) return { error: "Only admins can change this." };
  const parsed = WindowsZ.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the numbers." };
  await prisma.company.update({
    where: { id: session.companyId },
    data: { vaultViewMinutes: parsed.data.viewMinutes, vaultEditMinutes: parsed.data.editMinutes },
  });
  revalidatePath("/credentials");
  return { ok: true };
}

// ---- Helpers -------------------------------------------------------------------

/** The library's history: who did what to which title, and when. Never a value. */
async function logVault(session: SessionUser, projectId: string, message: string) {
  await logActivity({
    companyId: session.companyId,
    actorId: session.userId,
    actorLabel: await actorLabel(session.userId),
    entityType: "CREDENTIALS",
    entityId: projectId,
    message,
  });
}

function refresh(projectId: string) {
  revalidatePath(`/credentials/${projectId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}
