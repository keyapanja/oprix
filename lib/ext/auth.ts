import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// Bearer-token auth for the extension API. The raw token is shown to the client
// once (at connect); only its SHA-256 hash is stored. Tokens are revocable and
// (by default) expire after 90 days. This is also the device/session list that
// powers "connected devices" + sign-out-everywhere.
// ---------------------------------------------------------------------------

const TOKEN_BYTES = 32;
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a token for a user; returns the RAW token (caller shows it once). */
export async function mintExtensionToken(
  user: { id: string; companyId: string },
  label: string,
): Promise<{ raw: string; id: string }> {
  const raw = randomBytes(TOKEN_BYTES).toString("hex");
  const row = await prisma.extensionToken.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      tokenHash: hashToken(raw),
      label: label.slice(0, 80) || "Browser extension",
      expiresAt: new Date(Date.now() + DEFAULT_TTL_MS),
    },
    select: { id: true },
  });
  return { raw, id: row.id };
}

export type ExtAuth = { session: SessionUser; tokenId: string };

/** Authenticate a `Authorization: Bearer <token>` request → a SessionUser. */
export async function authenticateExtension(req: Request): Promise<ExtAuth | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return null;

  const row = await prisma.extensionToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          companyId: true,
          role: true,
          email: true,
          employeeId: true,
          clientId: true,
          isActive: true,
        },
      },
    },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  if (!row.user || !row.user.isActive) return null;

  // Best-effort "last used" bump — never block the request on it.
  void prisma.extensionToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const u = row.user;
  return {
    tokenId: row.id,
    session: {
      userId: u.id,
      companyId: u.companyId,
      role: u.role,
      email: u.email,
      employeeId: u.employeeId,
      clientId: u.clientId,
    },
  };
}

/** Revoke one token (scoped to its owner so users can't revoke others'). */
export async function revokeExtensionToken(tokenId: string, userId: string): Promise<void> {
  await prisma.extensionToken.updateMany({
    where: { id: tokenId, userId },
    data: { revokedAt: new Date() },
  });
}

/** A user's live (non-revoked) tokens, for the "connected devices" list. */
export async function listExtensionTokens(userId: string) {
  return prisma.extensionToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  });
}
