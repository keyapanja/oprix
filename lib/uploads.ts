import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

// Files are stored on disk under <repo>/uploads (NOT in the DB and NOT in
// public/, so they're only served through the auth-gated /api/files route).
// On a Node host, process.cwd() is the app root.
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

/** A unique storage key like "ab/ab12…f9.png" (2-char shard + random + ext). */
export function makeFileKey(originalName: string): string {
  const ext = path.extname(originalName).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  const rand = randomBytes(16).toString("hex");
  return `${rand.slice(0, 2)}/${rand}${ext}`;
}

/** Resolve a key to an absolute path, guarding against path traversal. */
function resolveKey(key: string): string {
  const abs = path.resolve(UPLOAD_ROOT, key);
  if (abs !== UPLOAD_ROOT && !abs.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error("Invalid file key");
  }
  return abs;
}

export async function saveUpload(key: string, data: Buffer): Promise<void> {
  const abs = resolveKey(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

export async function readUpload(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

export async function deleteUpload(key: string): Promise<void> {
  try {
    await fs.unlink(resolveKey(key));
  } catch {
    /* already gone — fine */
  }
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Best-effort content type from a stored key's extension (avatars/logos store no mime). */
export function mimeFromKey(key: string): string {
  return MIME_BY_EXT[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}
