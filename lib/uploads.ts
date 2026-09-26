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

/** What the uploads folder actually costs on disk right now. */
export type DiskUsage = { bytes: number; files: number; truncated: boolean };

/**
 * Walk `uploads/` and total it up. This is the only figure on the storage page
 * that isn't derived from the DB, so it's what reveals the gap — files left
 * behind by an interrupted delete, or uploads nothing points at any more.
 *
 * Capped at `limit` files so a runaway folder can't stall a page render; when
 * the cap is hit the caller shows the number as a floor, not a total.
 */
export async function folderUsage(limit = 20_000): Promise<DiskUsage> {
  const out: DiskUsage = { bytes: 0, files: 0, truncated: false };

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // folder missing (fresh install) or unreadable — count it as empty
    }
    for (const entry of entries) {
      if (out.files >= limit) {
        out.truncated = true;
        return;
      }
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        try {
          const st = await fs.stat(abs);
          out.bytes += st.size;
          out.files += 1;
        } catch {
          /* vanished mid-walk — skip */
        }
      }
    }
  }

  await walk(UPLOAD_ROOT);
  return out;
}

/**
 * Real on-disk sizes for a set of keys, as a map of key -> bytes. Keys missing
 * from the result have no file behind them any more, which is how the storage
 * console tells an admin that deleting a row would free nothing.
 *
 * Stats run one at a time on purpose: this is called with a whole project's
 * worth of keys, and firing thousands of concurrent stats would exhaust file
 * descriptors for no real speed-up on a local disk.
 */
export async function fileSizes(keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const key of keys) {
    if (out.has(key)) continue;
    try {
      const st = await fs.stat(resolveKey(key));
      if (st.isFile()) out.set(key, st.size);
    } catch {
      /* gone — leave it out of the map */
    }
  }
  return out;
}
