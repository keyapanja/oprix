// Allowlist sanitiser for the small amount of HTML a form builder may put in a
// field's help text: emphasis, a line break, a list, a link. Nothing else
// survives — not attributes, not event handlers, not a script's contents.
//
// It rebuilds the output from scratch rather than stripping bad bits out of the
// input: every text run is escaped, every tag is re-emitted from the allowlist
// with only the attributes we chose to keep. Runs on both sides (the builder's
// live preview and the fill page), so it has no dependencies.
//
// Isomorphic — no "server-only" — and deliberately small. If the needs ever
// grow past this list, that is the moment to pull in a real sanitiser rather
// than extend a hand-rolled one.

import { escapeHtml } from "@/lib/kb/markdown";

/** Tags a help text may use. Everything else is dropped (its text is kept). */
const ALLOWED = new Set(["b", "strong", "i", "em", "u", "s", "br", "p", "ul", "ol", "li", "a", "span", "small", "code"]);
/** Tags whose *contents* are dropped too — nothing inside them is text to show. */
const DROP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript"]);
const VOID = new Set(["br"]);

/** Only these URL schemes may appear in a link. A bare path is fine too. */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i;

export function sanitizeHelpHtml(input: string | null | undefined): string {
  if (!input) return "";
  const out: string[] = [];
  const open: string[] = [];
  // Tags, or everything up to the next tag. A lone "<" that starts no tag is
  // treated as text, which escapeHtml then renders harmlessly.
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+|</g;
  let skipUntil: string | null = null;

  for (const m of input.matchAll(re)) {
    const [token, rawName, rawAttrs] = m;

    if (skipUntil) {
      if (rawName && token.startsWith("</") && rawName.toLowerCase() === skipUntil) skipUntil = null;
      continue;
    }

    if (!rawName) {
      out.push(escapeHtml(token).replace(/&amp;(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, "&$1;"));
      continue;
    }

    const name = rawName.toLowerCase();
    const closing = token.startsWith("</");

    if (DROP_CONTENT.has(name)) {
      if (!closing && !token.endsWith("/>")) skipUntil = name;
      continue;
    }
    if (!ALLOWED.has(name)) continue;

    if (closing) {
      if (VOID.has(name)) continue;
      // Close back to the matching open tag, so a stray or mis-nested closer
      // can't leave the surrounding page's markup unbalanced.
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }

    if (VOID.has(name)) {
      out.push("<br>");
      continue;
    }

    // HTML lets a new <li> or <p> implicitly end the previous one. Honour that,
    // or "<li>one<li>two" comes out with the second item nested in the first.
    if ((name === "li" || name === "p") && open[open.length - 1] === name) {
      out.push(`</${open.pop()}>`);
    }

    let attrs = "";
    if (name === "a") {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs ?? "");
      const target = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim();
      if (!target || !SAFE_HREF.test(target)) continue; // a link going nowhere safe isn't a link
      attrs = ` href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer nofollow" class="text-accent-strong underline"`;
    }
    out.push(`<${name}${attrs}>`);
    open.push(name);
  }

  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}

/** Whether a help text contains any markup at all — plain ones skip innerHTML. */
export function looksLikeHtml(s: string | null | undefined): boolean {
  return !!s && /<[a-zA-Z]/.test(s);
}
