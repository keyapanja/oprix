import "server-only";
import { prisma } from "@/lib/db";
import { alreadyLimited, clientIp, rateLimited } from "@/lib/auth/rate-limit";
import type { ApiCall } from "@/lib/api/context";
import { ACCESS_PREFIX, KEY_PREFIX, sha256 } from "@/lib/api/tokens";

/**
 * Who is calling the client API. A key or access token resolves to one
 * connection, and the connection to one client portal login. All of it is
 * re-checked on every request — revoke a key, deactivate the login or switch
 * the client's API access off and the very next call is refused.
 */

const FAIL_MAX = 20; // bad keys per IP per window
const FAIL_WINDOW_MS = 10 * 60_000;
const CALLS_PER_MIN = 120; // per connection

export type AuthFailure = { status: 401 | 403 | 429; error: string; description: string };

/** `Authorization: Bearer …`, or `X-API-Key: …` for clients that can only set a custom header. */
function presented(req: Request): string | null {
  const auth = req.headers.get("authorization")?.trim();
  const m = auth ? /^Bearer\s+(\S+)$/i.exec(auth) : null;
  if (m) return m[1];
  return req.headers.get("x-api-key")?.trim() || null;
}

export type LiveConnection = {
  id: string;
  name: string;
  companyId: string;
  clientId: string;
  canWrite: boolean;
  projectIds: string[];
  lastUsedAt: Date | null;
  user: { id: string; email: string };
};

/** A connection that may be used right now — or why it may not. */
export async function liveConnection(connectionId: string): Promise<LiveConnection | { error: string }> {
  const c = await prisma.apiConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      name: true,
      companyId: true,
      clientId: true,
      canWrite: true,
      projectIds: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, email: true, isActive: true, role: true, clientId: true, companyId: true } },
      client: { select: { apiEnabled: true, deletedAt: true } },
    },
  });
  if (!c) return { error: "Unknown connection." };
  if (c.revokedAt) return { error: "This key or connection was revoked." };
  if (c.expiresAt <= new Date()) return { error: "This key or connection has expired." };
  const u = c.user;
  if (!u.isActive || u.role !== "CLIENT" || u.clientId !== c.clientId || u.companyId !== c.companyId) {
    return { error: "The portal login behind this connection is no longer active." };
  }
  if (!c.client.apiEnabled || c.client.deletedAt) return { error: "API access is switched off for this account." };
  return {
    id: c.id,
    name: c.name,
    companyId: c.companyId,
    clientId: c.clientId,
    canWrite: c.canWrite,
    projectIds: c.projectIds,
    lastUsedAt: c.lastUsedAt,
    user: { id: u.id, email: u.email },
  };
}

export async function authenticateApi(req: Request): Promise<{ call: ApiCall } | AuthFailure> {
  const ip = clientIp(req.headers);
  const failKey = `api-auth-fail:${ip}`;
  if (alreadyLimited(failKey, FAIL_MAX)) {
    return { status: 429, error: "rate_limited", description: "Too many failed attempts. Try again later." };
  }
  const token = presented(req);
  // No credential at all is how an OAuth client discovers it must sign in — not a failure.
  if (!token) return { status: 401, error: "invalid_token", description: "Sign in, or send an API key." };

  const fail = (description: string): AuthFailure => {
    rateLimited(failKey, FAIL_MAX, FAIL_WINDOW_MS);
    return { status: 401, error: "invalid_token", description };
  };

  let connectionId: string;
  if (token.startsWith(KEY_PREFIX)) {
    const row = await prisma.apiConnection.findUnique({
      where: { keyHash: sha256(token) },
      select: { id: true, kind: true },
    });
    if (!row || row.kind !== "KEY") return fail("Unknown API key.");
    connectionId = row.id;
  } else if (token.startsWith(ACCESS_PREFIX)) {
    const row = await prisma.oAuthToken.findUnique({
      where: { tokenHash: sha256(token) },
      select: { kind: true, connectionId: true, expiresAt: true, revokedAt: true },
    });
    if (!row || row.kind !== "ACCESS" || row.revokedAt || row.expiresAt <= new Date()) {
      return fail("Expired or unknown access token.");
    }
    connectionId = row.connectionId;
  } else {
    return fail("Unrecognised credential.");
  }

  const live = await liveConnection(connectionId);
  if ("error" in live) return { status: 403, error: "access_denied", description: live.error };

  if (rateLimited(`api:${live.id}`, CALLS_PER_MIN, 60_000)) {
    return { status: 429, error: "rate_limited", description: "Too many requests — slow down a little." };
  }

  // "Last used" without a write on every call.
  if (!live.lastUsedAt || Date.now() - live.lastUsedAt.getTime() > 60_000) {
    await prisma.apiConnection
      .update({ where: { id: live.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip === "unknown" ? null : ip } })
      .catch(() => {});
  }

  return {
    call: {
      session: {
        userId: live.user.id,
        companyId: live.companyId,
        role: "CLIENT",
        email: live.user.email,
        employeeId: null,
        clientId: live.clientId,
        via: "api",
      },
      connection: { id: live.id, name: live.name, canWrite: live.canWrite, projectIds: live.projectIds },
      ip: ip === "unknown" ? null : ip,
    },
  };
}

/** The client's primary contact: their earliest active portal login. Only they create keys or approve apps. */
export async function primaryContactId(clientId: string, companyId: string): Promise<string | null> {
  const first = await prisma.user.findFirst({
    where: { clientId, companyId, role: "CLIENT", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}
