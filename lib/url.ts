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
