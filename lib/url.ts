// Safe handling of user-supplied links. Blocks javascript:/data:/etc. so a
// stored link can never execute when rendered as an <a href> or opened.
// Plain util (no "server-only") — used on both server and client.

/** Returns a normalized http(s) URL, or null if the input isn't a safe web URL. */
export function normalizeHttpUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const candidate = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** href for rendering a user-supplied link: the URL if http(s), else "#". */
export function safeHref(raw: string | null | undefined): string {
  return normalizeHttpUrl(raw) ?? "#";
}

/** True if the value is a stored http(s) link (vs a plain status note). Stored
 *  links are always normalized with an explicit scheme, so this distinguishes
 *  them from free text. */
export function isHttpUrl(raw: string | null | undefined): boolean {
  return /^https?:\/\//i.test((raw ?? "").trim());
}

/** Heuristic: is this input meant as a web link rather than a plain status note?
 *  True for an explicit http(s):// scheme or a bare domain (example.com/…); a
 *  value with spaces, or with no dotted host, is treated as text. */
export function looksLikeUrl(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim();
  if (!s || /\s/.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return true;
  return /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(s);
}
