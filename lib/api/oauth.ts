import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { liveConnection, primaryContactId } from "@/lib/api/auth";
import { notifyNewConnection } from "@/lib/api/notify";
import {
  ACCESS_PREFIX,
  ACCESS_TTL_SEC,
  CODE_TTL_MS,
  CONNECTION_DAYS,
  REFRESH_PREFIX,
  mint,
  pkceMatches,
  sha256,
} from "@/lib/api/tokens";

/**
 * The sign-in flow behind "Connect" in Claude: OAuth 2.1 with PKCE, dynamic
 * client registration, one-time codes, 1-hour access tokens and refresh
 * tokens that rotate on every use. A replayed code or refresh token ends the
 * whole connection — that only happens when one has leaked.
 */

export const SCOPES = ["oprix:read", "oprix:write"] as const;

export const issuer = () => new URL(appUrl("/")).origin;
export const resourceUrl = () => appUrl("/api/mcp");

export type OAuthError = { error: string; error_description: string };
const err = (error: string, error_description: string): OAuthError => ({ error, error_description });

// ---- Registration (RFC 7591) -----------------------------------------------------

/** https anywhere, or http on this machine (desktop tools listen on localhost). */
function okRedirect(raw: string): boolean {
  if (raw.length > 500) return false;
  try {
    const u = new URL(raw);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export async function registerApp(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 5 || !uris.every(okRedirect)) {
    return err("invalid_redirect_uri", "redirect_uris must be 1–5 https URLs (or http://localhost).");
  }
  const name = (typeof b.client_name === "string" ? b.client_name : "AI app").trim().slice(0, 60) || "AI app";
  const id = `oprix_app_${randomBytes(16).toString("base64url")}`;
  const app = await prisma.oAuthApp.create({ data: { id, name, redirectUris: uris } });
  return {
    client_id: app.id,
    client_name: app.name,
    redirect_uris: app.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(app.createdAt.getTime() / 1000),
  };
}

// ---- The consent screen's request --------------------------------------------------

export type AuthorizeRequest = {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  scope?: string;
  resource?: string;
};

export type CheckedRequest = {
  app: { id: string; name: string };
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  /** The app asked for read-and-change (or didn't say). */
  wantsWrite: boolean;
};

/** Where to send an error once the redirect URI is trusted. */
export function redirectWith(uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  u.searchParams.set("iss", issuer());
  return u.toString();
}

/**
 * Validate an authorization request. An unknown app or an unregistered
 * redirect URI is shown as an error on our page — never redirected to, or the
 * consent screen would become an open redirect.
 */
export async function checkAuthorize(
  q: Partial<AuthorizeRequest>,
): Promise<{ ok: CheckedRequest } | { fatal: string } | { redirect: string }> {
  if (!q.client_id || !q.redirect_uri) return { fatal: "This sign-in link is incomplete. Start again from your AI app." };
  const app = await prisma.oAuthApp.findUnique({ where: { id: q.client_id }, select: { id: true, name: true, redirectUris: true } });
  if (!app) return { fatal: "This app isn't registered. Start again from your AI app." };
  if (!app.redirectUris.includes(q.redirect_uri)) return { fatal: "This app's return address doesn't match its registration." };

  const back = (error: string, description: string) => ({
    redirect: redirectWith(q.redirect_uri!, { error, error_description: description, state: q.state }),
  });
  if (q.response_type !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");
  if (!q.code_challenge || q.code_challenge_method !== "S256") return back("invalid_request", "PKCE with S256 is required.");
  if (q.resource && !sameResource(q.resource)) return back("invalid_target", "Unknown resource.");

  const scopes = (q.scope ?? "").split(/\s+/).filter(Boolean);
  return {
    ok: {
      app: { id: app.id, name: app.name },
      redirectUri: q.redirect_uri,
      state: q.state ?? null,
      codeChallenge: q.code_challenge,
      wantsWrite: scopes.length === 0 || scopes.includes("oprix:write"),
    },
  };
}

function sameResource(r: string): boolean {
  const norm = (s: string) => s.replace(/\/+$/, "");
  return norm(r) === norm(resourceUrl()) || norm(r) === issuer();
}

/** After the primary contact approves: a one-time code for the app to exchange. */
export async function issueCode(input: {
  appId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  canWrite: boolean;
  projectIds: string[];
}): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await prisma.oAuthCode.create({
    data: { ...input, codeHash: sha256(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return code;
}

// ---- Tokens ------------------------------------------------------------------------

type TokenSet = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

async function issueTokens(connectionId: string, connectionExpires: Date, canWrite: boolean): Promise<TokenSet> {
  const access = mint(ACCESS_PREFIX);
  const refresh = mint(REFRESH_PREFIX);
  await prisma.oAuthToken.createMany({
    data: [
      { connectionId, kind: "ACCESS", tokenHash: sha256(access), expiresAt: new Date(Date.now() + ACCESS_TTL_SEC * 1000) },
      { connectionId, kind: "REFRESH", tokenHash: sha256(refresh), expiresAt: connectionExpires },
    ],
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SEC,
    refresh_token: refresh,
    scope: canWrite ? "oprix:read oprix:write" : "oprix:read",
  };
}

/** End a connection and everything issued under it. */
export async function revokeConnection(connectionId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.apiConnection.updateMany({ where: { id: connectionId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.oAuthToken.updateMany({ where: { connectionId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
}

export async function exchangeCode(p: Record<string, string | undefined>): Promise<TokenSet | OAuthError> {
  if (!p.code || !p.redirect_uri || !p.client_id || !p.code_verifier) {
    return err("invalid_request", "code, redirect_uri, client_id and code_verifier are required.");
  }
  const row = await prisma.oAuthCode.findUnique({ where: { codeHash: sha256(p.code) } });
  if (!row) return err("invalid_grant", "Unknown code.");
  if (row.usedAt) {
    // Replayed: whoever has it isn't the app it was issued to. End what it made.
    if (row.connectionId) await revokeConnection(row.connectionId);
    return err("invalid_grant", "This code was already used.");
  }
  if (row.expiresAt <= new Date()) return err("invalid_grant", "This code has expired.");
  if (row.appId !== p.client_id || row.redirectUri !== p.redirect_uri) return err("invalid_grant", "This code wasn't issued to this app.");
  if (!pkceMatches(p.code_verifier, row.codeChallenge)) return err("invalid_grant", "PKCE verification failed.");
  if (p.resource && !sameResource(p.resource)) return err("invalid_target", "Unknown resource.");

  const burned = await prisma.oAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (burned.count !== 1) return err("invalid_grant", "This code was already used.");

  // Still allowed? The approval was minutes ago, but check again.
  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { id: true, companyId: true, clientId: true, role: true, isActive: true, client: { select: { apiEnabled: true } } },
  });
  if (!user?.isActive || user.role !== "CLIENT" || !user.clientId || !user.client?.apiEnabled) {
    return err("access_denied", "API access isn't available for this account.");
  }
  if ((await primaryContactId(user.clientId, user.companyId)) !== user.id) {
    return err("access_denied", "Only the account's primary contact can connect apps.");
  }
  const app = await prisma.oAuthApp.findUnique({ where: { id: row.appId }, select: { name: true } });

  const expiresAt = new Date(Date.now() + CONNECTION_DAYS * 86_400_000);
  const connection = await prisma.apiConnection.create({
    data: {
      companyId: user.companyId,
      clientId: user.clientId,
      userId: user.id,
      kind: "OAUTH",
      name: app?.name ?? "AI app",
      oauthAppId: row.appId,
      canWrite: row.canWrite,
      projectIds: row.projectIds,
      expiresAt,
    },
    select: { id: true },
  });
  await prisma.oAuthCode.update({ where: { id: row.id }, data: { connectionId: connection.id } });
  await notifyNewConnection(connection.id);
  return issueTokens(connection.id, expiresAt, row.canWrite);
}

export async function refreshTokens(p: Record<string, string | undefined>): Promise<TokenSet | OAuthError> {
  if (!p.refresh_token) return err("invalid_request", "refresh_token is required.");
  const row = await prisma.oAuthToken.findUnique({
    where: { tokenHash: sha256(p.refresh_token) },
    select: { id: true, kind: true, connectionId: true, revokedAt: true, expiresAt: true, connection: { select: { oauthAppId: true } } },
  });
  if (!row || row.kind !== "REFRESH") return err("invalid_grant", "Unknown refresh token.");
  if (p.client_id && row.connection.oauthAppId !== p.client_id) return err("invalid_grant", "This token wasn't issued to this app.");
  if (row.revokedAt) {
    // A rotated-out token coming back means two parties hold it. End it.
    await revokeConnection(row.connectionId);
    return err("invalid_grant", "This refresh token was already used.");
  }
  if (row.expiresAt <= new Date()) return err("invalid_grant", "This refresh token has expired.");

  const live = await liveConnection(row.connectionId);
  if ("error" in live) return err("invalid_grant", live.error);

  const rotated = await prisma.oAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (rotated.count !== 1) {
    await revokeConnection(row.connectionId);
    return err("invalid_grant", "This refresh token was already used.");
  }
  // Access tokens from before are no longer needed.
  await prisma.oAuthToken.updateMany({
    where: { connectionId: row.connectionId, kind: "ACCESS", revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const conn = await prisma.apiConnection.findUnique({ where: { id: row.connectionId }, select: { expiresAt: true, canWrite: true } });
  return issueTokens(row.connectionId, conn!.expiresAt, conn!.canWrite);
}

/** RFC 7009: revoking a token ends its connection. Unknown tokens are fine — always 200. */
export async function revokeToken(token: string | undefined) {
  if (!token) return;
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash: sha256(token) }, select: { connectionId: true } });
  if (row) await revokeConnection(row.connectionId);
}
