// Minimal, XSS-safe Markdown → HTML. HTML is escaped FIRST, so no user-authored
// markup can pass through; we then layer a small Markdown subset on top. Safe to
// import on server or client (used for both rendering and the live editor preview).

const HSIZE: Record<number, string> = {
  1: "text-xl font-bold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Turn bare http(s)/www URLs into new-tab links, skipping anything already
// inside an <a>…</a> or <code>…</code>. Input is already HTML-escaped, so a URL
// can contain neither '<' nor a literal '"' — the inserted href can't break out.
function autolinkBareUrls(html: string): string {
  return html
    .split(/(<a\b[^>]*>.*?<\/a>|<code\b[^>]*>.*?<\/code>)/gi)
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // a captured <a>/<code> chunk — leave intact
      return seg.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+)/gi, (_full, pre, raw) => {
        let core = raw as string;
        let trail = "";
        const punct = core.match(/[.,;:!?]+$/);
        if (punct) {
          trail = punct[0];
          core = core.slice(0, -trail.length);
        }
        if (core.endsWith(")") && !core.includes("(")) {
          core = core.slice(0, -1);
          trail = ")" + trail;
        }
        const href = /^www\./i.test(core) ? `https://${core}` : core;
        return `${pre}<a href="${href}" class="text-accent-strong underline" target="_blank" rel="noopener noreferrer">${core}</a>${trail}`;
      });
    })
    .join("");
}

function inline(s: string): string {
  const withMarkup = s
    .replace(/`([^`]+)`/g, '<code class="rounded bg-canvas px-1 py-0.5 text-[0.85em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
      '<a href="$2" class="text-accent-strong underline" target="_blank" rel="noopener noreferrer">$1</a>',
    );
  return autolinkBareUrls(withMarkup);
}

export function renderMarkdown(md: string): string {
  const lines = escapeHtml((md ?? "").replace(/\r\n/g, "\n")).split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      out.push(`<p class="my-2 leading-relaxed">${inline(para.join(" "))}</p>`);
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flush();
      i++;
      const code: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++; // closing fence
      out.push(`<pre class="my-3 overflow-x-auto rounded-xl bg-canvas p-3 text-xs text-content"><code>${code.join("\n")}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      out.push(`<h${level} class="mt-4 mb-1.5 ${HSIZE[level]} text-content">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      flush();
      out.push('<hr class="my-4 border-line" />');
      i++;
      continue;
    }

    if (/^&gt;\s?/.test(line)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) q.push(lines[i++].replace(/^&gt;\s?/, ""));
      out.push(`<blockquote class="my-3 border-l-2 border-brand-500 pl-3 text-muted">${inline(q.join(" "))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*[-*]\s+/, "")));
      out.push(`<ul class="my-2 list-disc space-y-1 pl-5">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*\d+\.\s+/, "")));
      out.push(`<ol class="my-2 list-decimal space-y-1 pl-5">${items.map((t) => `<li>${t}</li>`).join("")}</ol>`);
      continue;
    }

    if (/^\s*$/.test(line)) {
      flush();
      i++;
      continue;
    }

    para.push(line);
    i++;
  }
  flush();
  return out.join("\n");
}
