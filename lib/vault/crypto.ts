import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "crypto";

/**
 * Encryption for the credentials library.
 *
 * One master key, CREDENTIALS_KEY (32 random bytes, base64), lives in the
 * server env — never in the database, never in git. Two working keys are
 * derived from it with HKDF so the key that encrypts entries and the key that
 * hashes emailed codes are never the same bytes.
 *
 * Entries are AES-256-GCM: a fresh random IV per encryption, and the auth tag
 * makes any tampering with the stored text fail loudly instead of decrypting
 * to garbage. Each ciphertext is also bound (as GCM "additional data") to the
 * project, the row and the field it belongs to, so copying one row's
 * ciphertext into another row — or another project — won't decrypt.
 *
 * Lose the key and every saved entry is unreadable; that's the point, and the
 * reason it has to be kept somewhere safe besides the server.
 */

const VERSION = "v1";

function masterKey(): Buffer | null {
  const raw = process.env.CREDENTIALS_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

/** Is a usable key set? The library shows "not set up" rather than failing. */
export function vaultConfigured(): boolean {
  return masterKey() !== null;
}

function derived(purpose: "entries" | "codes"): Buffer {
  const key = masterKey();
  if (!key) throw new Error("The credentials library isn't set up (CREDENTIALS_KEY).");
  return Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), `oprix-vault-${purpose}`, 32));
}

/** What a ciphertext is bound to: its project, its row, and which field it is. */
export function aad(projectId: string, credentialId: string, field: "url" | "secret"): string {
  return `${projectId}:${credentialId}:${field}`;
}

/** Encrypt → "v1.<iv>.<tag>.<ciphertext>", each part base64url. */
export function encrypt(plain: string, boundTo: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derived("entries"), iv);
  cipher.setAAD(Buffer.from(boundTo, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

/** Decrypt a value from {@link encrypt}. Throws if it was altered or moved. */
export function decrypt(sealed: string, boundTo: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) throw new Error("Unreadable entry.");
  const decipher = createDecipheriv("aes-256-gcm", derived("entries"), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(boundTo, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/** A 6-digit code, uniformly random (randomInt, not Math.random). */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC of a code, bound to its row so a hash can't be reused for another code. */
export function hashCode(codeId: string, code: string): string {
  return createHmac("sha256", derived("codes")).update(`${codeId}:${code}`).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function sameDigest(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** A random cookie token, and the SHA-256 that's stored in its place. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
