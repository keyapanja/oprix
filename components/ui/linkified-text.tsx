import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { safeHref } from "@/lib/url";

// Match http(s):// and www. URLs in prose. We deliberately do NOT match bare
// domains (e.g. "Node.js", "etc.") to avoid false positives in normal text.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

// Trailing sentence punctuation shouldn't be swallowed into the link.
function splitTrailing(url: string): [string, string] {
  let core = url;
  let trail = "";
  const punct = core.match(/[.,;:!?'"]+$/);
  if (punct) {
    trail = punct[0];
    core = core.slice(0, -trail.length);
  }
  // A closing paren that has no matching open paren is sentence punctuation,
  // e.g. "(see https://example.com)".
  if (core.endsWith(")") && !core.includes("(")) {
    core = core.slice(0, -1);
    trail = ")" + trail;
  }
  return [core, trail];
}

/** Split plain text into nodes, turning URLs into links that open in a new tab. */
export function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(URL_RE); // fresh instance — lastIndex is stateful
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const [url, trail] = splitTrailing(m[0]);
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    nodes.push(
      <a
        key={key++}
        href={safeHref(href)}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-accent-strong underline underline-offset-2 hover:opacity-80"
      >
        {url}
      </a>,
    );
    if (trail) nodes.push(trail);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Renders a plain-text field (descriptions, notes) with clickable links that
 * open in a new tab and preserved line breaks. For Markdown / rich-text bodies
 * use renderMarkdown instead — it already linkifies.
 */
export function LinkifiedText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  return <p className={cn("whitespace-pre-wrap break-words", className)}>{linkify(text ?? "")}</p>;
}
