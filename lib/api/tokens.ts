import "server-only";
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";

/**
 * Secrets for the client API. Every one is 32 random bytes, prefixed so a
 * leaked one is recognisable (GitHub's secret scanning, a log line, a support
 * ticket) and so the server knows which table to look in. Only SHA-256 hashes
 * are stored — the values are high-entropy, so a plain hash is enough.
 *
 *   oprix_sk_…  an API key the client's primary contact created (90 days)
 *   oprix_at_…  an OAuth access token (1 hour)
 *   oprix_rt_…  an OAuth refresh token (rotated on every use)
 */

export const KEY_PREFIX = "oprix_sk_";
export const ACCESS_PREFIX = "oprix_at_";
export const REFRESH_PREFIX = "oprix_rt_";

export const CONNECTION_DAYS = 90;
export const ACCESS_TTL_SEC = 60 * 60;
export const CODE_TTL_MS = 10 * 60_000;

export function mint(prefix: string): string {
  return prefix + randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** "oprix_sk_AbCd" — enough to tell keys apart in a list, useless to an attacker. */
export function displayPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 4);
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** PKCE S256: base64url(SHA-256(verifier)) must equal the challenge from the start of the flow. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return sameText(createHash("sha256").update(verifier).digest("base64url"), challenge);
}

// ---- Download links ------------------------------------------------------------
// A file an agent asks for can be too big to hand back inline, so it gets a
// link instead: signed, short-lived, and tied to the connection — revoke the
// connection and its links stop working too.

function linkKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.alloc(0), "oprix-api-file-links", 32));
}

export type FileLink = { attachmentId: string; connectionId: string; exp: number };

export function signFileLink(link: FileLink): string {
  const body = Buffer.from(JSON.stringify([link.attachmentId, link.connectionId, link.exp])).toString("base64url");
  const sig = createHmac("sha256", linkKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readFileLink(token: string): FileLink | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", linkKey()).update(body).digest("base64url");
  if (!sameText(sig, expected)) return null;
  try {
    const [attachmentId, connectionId, exp] = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof attachmentId !== "string" || typeof connectionId !== "string" || typeof exp !== "number") return null;
    if (exp < Date.now()) return null;
    return { attachmentId, connectionId, exp };
  } catch {
    return null;
  }
}
