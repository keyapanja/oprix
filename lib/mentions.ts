import { escapeHtml } from "@/lib/kb/markdown";

export type MentionPerson = { id: string; name: string };
export type MentionHit = { person: MentionPerson; start: number; end: number };

/**
 * Finds every `@Name` in `text` that names someone on the roster.
 *
 * One scanner serves both jobs — deciding who gets notified, and deciding what
 * gets highlighted — so the two can't drift apart. A highlighted name in a
 * comment is exactly a name that was pinged, which is the whole point of
 * showing it differently in the first place.
 *
 * Three rules make it behave the way people expect:
 *  - **Longest name wins.** With both "Ravi" and "Ravi Kumar" on the roster,
 *    "@Ravi Kumar" tags Ravi Kumar alone instead of quietly pinging both.
 *  - **The `@` must start a word**, so `someone@example.com` in the middle of a
 *    sentence isn't read as a mention.
 *  - **The name must end at a word boundary**, so "@Ravi" doesn't match inside
 *    "@Ravish". Trailing punctuation still counts — "thanks @Ravi Kumar!" tags
 *    him.
 *
 * Names are matched exactly (case and spacing), which is what the editor
 * inserts when someone picks from the @-menu.
 */
export function scanMentions(text: string, people: MentionPerson[]): MentionHit[] {
  const roster = people
    .filter((p) => p.name.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  if (!roster.length) return [];

  const hits: MentionHit[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "@" || (i > 0 && /[\w@]/.test(text[i - 1]))) {
      i += 1;
      continue;
    }
    const at = i + 1;
    const hit = roster.find((p) => {
      if (text.slice(at, at + p.name.length) !== p.name) return false;
      const after = text[at + p.name.length];
      return after === undefined || !/\w/.test(after);
    });
    if (!hit) {
      i += 1;
      continue;
    }
    const end = at + hit.name.length;
    hits.push({ person: hit, start: i, end });
    i = end;
  }
  return hits;
}

/**
 * Code is text *about* code: "@Ravi" in a code span or fence names nobody, and
 * the renderer won't highlight it either. Replaced with a space rather than
 * removed so the words either side don't run together into a false match.
 */
function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

/**
 * The distinct people tagged in a comment's Markdown, in the order they first
 * appear — this is the notification list.
 *
 * Matches what the rendered comment highlights, with one documented exception:
 * a mention inside an existing link (`[ask @Ravi](/x)`) still pings, because it
 * is still prose addressed to him — it just can't be *drawn* as a link, since
 * anchors don't nest.
 */
export function mentionedIds(text: string, people: MentionPerson[]): string[] {
  return [...new Set(scanMentions(stripCode(text), people).map((h) => h.person.id))];
}

// Chunks that must be left exactly as they are: an existing link (never nest
// an <a>), and code, where "@someone" is text about code, not a ping.
const OPAQUE = /(<a\b[^>]*>[\s\S]*?<\/a>|<code\b[^>]*>[\s\S]*?<\/code>|<pre\b[^>]*>[\s\S]*?<\/pre>)/gi;
const TAGS = /(<[^>]+>)/g;

const CHIP =
  'rounded px-1 font-semibold text-accent-strong bg-accent-soft hover:underline';

/**
 * Turns `@Name` into a link to that person, in already-rendered comment HTML.
 *
 * Runs *after* `renderMarkdown`, on escaped output, for the same reason
 * `autolinkBareUrls` does: only then can it tell prose from markup and skip
 * what's inside a link or a code block. Roster names are escaped to match the
 * escaped haystack, and the escaped name is what gets written back out, so
 * nothing a person is called can inject markup.
 *
 * `id` is an **Employee** id — the link target is `/people/<id>`, matching the
 * author name above each comment.
 *
 * Deliberately not used inside the editor: it serializes back through
 * `htmlToMarkdown`, so a link wrapped around a mention would be saved as
 * `[@Name](/people/…)` and the plain `@Name` the notifier looks for would be
 * gone after one edit.
 */
export function highlightMentions(html: string, people: MentionPerson[]): string {
  if (!people.length || !html.includes("@")) return html;
  const roster = people.map((p) => ({ id: p.id, name: escapeHtml(p.name) }));

  return html
    .split(OPAQUE)
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // a captured <a>/<code>/<pre> — leave intact
      return seg
        .split(TAGS)
        .map((part, j) => (j % 2 === 1 ? part : link(part, roster)))
        .join("");
    })
    .join("");
}

function link(text: string, roster: MentionPerson[]): string {
  const hits = scanMentions(text, roster);
  if (!hits.length) return text;
  let out = "";
  let last = 0;
  for (const h of hits) {
    out += text.slice(last, h.start);
    out += `<a href="/people/${encodeURIComponent(h.person.id)}" class="${CHIP}">@${h.person.name}</a>`;
    last = h.end;
  }
  return out + text.slice(last);
}
