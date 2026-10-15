/**
 * Task comments are one thread shared by the team and the client, so one stored
 * body has to read correctly for both.
 *
 * Images in a comment are embedded as `![alt](/api/files/<id>)`. That route is
 * staff-only — the proxy sends a client anywhere outside /portal back to
 * /portal — and the portal serves the same attachment from /api/portal/files.
 * So the stored body always uses the staff form: the portal swaps in its own
 * route on the way out ({@link forPortal}) and swaps it back on the way in
 * ({@link fromPortal}).
 */
export function forPortal(body: string): string {
  return body.replace(/\]\(\/api\/files\//g, "](/api/portal/files/");
}

export function fromPortal(body: string): string {
  return body.replace(/\]\(\/api\/portal\/files\//g, "](/api/files/");
}

/** A comment as one short plain line, for a notification ("" if it's only images). */
export function commentExcerpt(body: string, max = 140): string {
  const plain = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/[*_`#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** "Name commented on “Task”: excerpt" — the one wording both directions use. */
export function commentNote(actor: string, taskName: string, body: string): string {
  const excerpt = commentExcerpt(body);
  return `${actor} commented on “${taskName}”${excerpt ? `: ${excerpt}` : ""}`;
}
