"use client";

import { toast } from "@/components/ui/toast";
import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/kb/markdown";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 *  HTML → Markdown serializer
 *
 *  The editor is a contentEditable surface, so the browser hands us HTML.
 *  We walk that DOM and emit Markdown, which is what we store. Storage stays
 *  Markdown end-to-end, so the existing escape-first renderMarkdown keeps
 *  rendering (XSS-safe by construction) — no HTML is ever trusted server-side.
 * ------------------------------------------------------------------ */

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const kids = () => Array.from(el.childNodes).map(inlineText).join("");
  switch (el.tagName) {
    case "BR":
      return "\n";
    case "STRONG":
    case "B": {
      const t = kids();
      return t.trim() ? `**${t}**` : t;
    }
    case "EM":
    case "I": {
      const t = kids();
      return t.trim() ? `*${t}*` : t;
    }
    case "CODE":
      return `\`${el.textContent ?? ""}\``;
    case "A": {
      const href = el.getAttribute("href") ?? "";
      const t = kids();
      return href ? `[${t}](${href})` : t;
    }
    default:
      return kids();
  }
}

// Collapse whitespace for inline content (PRE is handled separately).
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function blockText(el: HTMLElement): string {
  switch (el.tagName) {
    case "H1":
      return `# ${collapse(inlineText(el))}`;
    case "H2":
      return `## ${collapse(inlineText(el))}`;
    case "H3":
      return `### ${collapse(inlineText(el))}`;
    case "H4":
      return `#### ${collapse(inlineText(el))}`;
    case "BLOCKQUOTE": {
      const t = collapse(inlineText(el));
      return t ? `> ${t}` : "";
    }
    case "UL":
      return Array.from(el.children)
        .filter((c) => c.tagName === "LI")
        .map((li) => `- ${collapse(inlineText(li))}`)
        .join("\n");
    case "OL": {
      let n = 0;
      return Array.from(el.children)
        .filter((c) => c.tagName === "LI")
        .map((li) => `${++n}. ${collapse(inlineText(li))}`)
        .join("\n");
    }
    case "PRE":
      return "```\n" + (el.textContent ?? "").replace(/\n+$/, "") + "\n```";
    case "HR":
      return "---";
    default:
      return collapse(inlineText(el)); // P, DIV, bare inline wrappers
  }
}

export function htmlToMarkdown(root: HTMLElement): string {
  const blocks: string[] = [];
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = collapse(node.textContent ?? "");
      if (t) blocks.push(t);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const md = blockText(node as HTMLElement);
      if (md.trim()) blocks.push(md);
    }
  });
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------ *
 *  The editor
 * ------------------------------------------------------------------ */

type Active = { bold: boolean; italic: boolean; ul: boolean; ol: boolean; block: string };
const NO_ACTIVE: Active = { bold: false, italic: false, ul: false, ol: false, block: "" };

function ancestorTag(node: Node | null, tag: string, root: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === tag) return n as HTMLElement;
    n = n.parentNode;
  }
  return null;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write the guide…",
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const [empty, setEmpty] = useState(!value?.trim());
  const [active, setActive] = useState<Active>(NO_ACTIVE);

  // Seed the editor from the initial Markdown exactly once; thereafter it is
  // uncontrolled (re-setting innerHTML would fight the cursor).
  useEffect(() => {
    const el = ref.current;
    if (el && !inited.current) {
      el.innerHTML = value?.trim() ? renderMarkdown(value) : "";
      try {
        document.execCommand("defaultParagraphSeparator", false, "p");
      } catch {
        /* not supported — falls back to <div>, which we still serialize */
      }
      inited.current = true;
    }
  }, [value]);

  function currentBlock(): string {
    const sel = window.getSelection();
    let node: Node | null = sel?.anchorNode ?? null;
    const root = ref.current;
    while (node && node !== root) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as HTMLElement).tagName;
        if (/^(H1|H2|H3|H4|BLOCKQUOTE|PRE|LI)$/.test(tag)) return tag;
      }
      node = node.parentNode;
    }
    return "P";
  }

  function refresh() {
    if (typeof document === "undefined") return;
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      ul: document.queryCommandState("insertUnorderedList"),
      ol: document.queryCommandState("insertOrderedList"),
      block: currentBlock(),
    });
  }

  function sync() {
    const el = ref.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim());
    onChange(htmlToMarkdown(el));
    refresh();
  }

  function exec(cmd: string, val?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    sync();
  }

  function toggleBlock(tag: string) {
    const isOn = currentBlock() === tag;
    exec("formatBlock", isOn ? "<p>" : `<${tag.toLowerCase()}>`);
  }

  function toggleCode() {
    const root = ref.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return;
    const existing = ancestorTag(sel.anchorNode, "CODE", root);
    if (existing) {
      const parent = existing.parentNode!;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
    } else {
      if (sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const code = document.createElement("code");
      try {
        range.surroundContents(code);
      } catch {
        code.appendChild(range.extractContents());
        range.insertNode(code);
      }
    }
    sync();
  }

  function addLink() {
    const root = ref.current;
    const sel = window.getSelection();
    const existing = ancestorTag(sel?.anchorNode ?? null, "A", root);
    if (existing) return exec("unlink");
    if (!sel || sel.isCollapsed) {
      toast.error("Select the text you want to turn into a link first.");
      return;
    }
    const url = window.prompt("Link URL (https://… or /path):", "https://");
    if (!url) return;
    exec("createLink", url.trim());
  }

  const Btn = ({
    on,
    onClick,
    title,
    children,
    className,
  }: {
    on?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      // Keep the editor's selection — don't let the button steal focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-muted transition-colors hover:bg-surface hover:text-content",
        on && "bg-surface text-accent-strong shadow-sm",
        className,
      )}
    >
      {children}
    </button>
  );

  const Sep = () => <span className="mx-0.5 h-5 w-px bg-line" />;

  return (
    <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-inset ring-line-strong focus-within:ring-2 focus-within:ring-brand-500">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-canvas/60 px-1.5 py-1">
        <Btn on={active.bold} onClick={() => exec("bold")} title="Bold (Ctrl+B)">
          <span className="font-bold">B</span>
        </Btn>
        <Btn on={active.italic} onClick={() => exec("italic")} title="Italic (Ctrl+I)">
          <span className="italic">I</span>
        </Btn>
        <Btn onClick={toggleCode} title="Inline code">
          <span className="font-mono text-xs">{"</>"}</span>
        </Btn>
        <Sep />
        <Btn on={active.block === "H1"} onClick={() => toggleBlock("H1")} title="Heading 1">
          <span className="font-semibold">H1</span>
        </Btn>
        <Btn on={active.block === "H2"} onClick={() => toggleBlock("H2")} title="Heading 2">
          <span className="font-semibold">H2</span>
        </Btn>
        <Btn on={active.block === "H3"} onClick={() => toggleBlock("H3")} title="Heading 3">
          <span className="font-semibold">H3</span>
        </Btn>
        <Sep />
        <Btn on={active.ul} onClick={() => exec("insertUnorderedList")} title="Bulleted list">
          <span className="text-base leading-none">•</span>
        </Btn>
        <Btn on={active.ol} onClick={() => exec("insertOrderedList")} title="Numbered list">
          <span className="text-xs font-semibold">1.</span>
        </Btn>
        <Btn on={active.block === "BLOCKQUOTE"} onClick={() => toggleBlock("BLOCKQUOTE")} title="Quote">
          <span className="text-base leading-none">&ldquo;</span>
        </Btn>
        <Btn onClick={addLink} title="Link / unlink">
          <span className="text-xs font-medium underline">Link</span>
        </Btn>
      </div>

      <div className="relative">
        {empty && (
          <p className="pointer-events-none absolute left-4 top-3 text-sm text-faint">{placeholder}</p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={sync}
          onKeyUp={refresh}
          onMouseUp={refresh}
          onFocus={refresh}
          className={cn(
            "min-h-80 max-w-none px-4 py-3 text-[15px] leading-relaxed text-content focus:outline-none",
            // Style whatever tags appear, regardless of source (initial render or live edits).
            "[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-xl [&_h1]:font-bold",
            "[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-lg [&_h2]:font-semibold",
            "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-semibold",
            "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
            "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-brand-500 [&_blockquote]:pl-3 [&_blockquote]:text-muted",
            "[&_a]:text-accent-strong [&_a]:underline [&_strong]:font-semibold",
            "[&_code]:rounded [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
            "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-canvas [&_pre]:p-3 [&_pre]:text-xs",
          )}
        />
      </div>
    </div>
  );
}
