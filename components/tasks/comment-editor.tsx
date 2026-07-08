"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { renderMarkdown } from "@/lib/kb/markdown";
import { htmlToMarkdown } from "@/components/kb/rich-text-editor";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Person = { id: string; name: string };

/**
 * Compact rich-text comment editor. It's a contentEditable surface that
 * serializes to Markdown (reusing the KB editor's htmlToMarkdown + the XSS-safe
 * renderMarkdown), so storage stays Markdown end-to-end. Supports **bold /
 * italic / lists / links**, an image button + **clipboard image paste** (each
 * image uploads to `uploadUrl` and is embedded as `![](…)`), and @-mentions.
 */
export function CommentEditor({
  value,
  onChange,
  people,
  uploadUrl,
  placeholder = "Write a comment…  Type @ to mention, or paste an image",
  autoFocus = false,
  onSubmit,
}: {
  value: string;
  onChange: (markdown: string) => void;
  people: Person[];
  uploadUrl: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  const [empty, setEmpty] = useState(!value?.trim());
  const [uploading, setUploading] = useState(false);
  const [mQuery, setMQuery] = useState<string | null>(null);
  const [mActive, setMActive] = useState(0);
  const [mPos, setMPos] = useState<{ left: number; top: number } | null>(null);

  // Seed the editor from the initial Markdown once; thereafter it's uncontrolled
  // (re-setting innerHTML would fight the caret). Callers clear it by remounting.
  useEffect(() => {
    const el = ref.current;
    if (el && !inited.current) {
      el.innerHTML = value?.trim() ? renderMarkdown(value) : "";
      inited.current = true;
      if (autoFocus) el.focus();
    }
  }, [value, autoFocus]);

  function sync() {
    const el = ref.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector("img"));
    onChange(htmlToMarkdown(el));
  }

  // ---- image upload (button + paste) --------------------------------------
  async function uploadImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast.error(j?.error || (res.status === 413 ? "Image too large for the server/proxy" : "Image upload failed"));
        return;
      }
      const j = (await res.json()) as { url?: string };
      if (j.url) insertImage(j.url, file.name);
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function insertImage(url: string, alt: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const img = document.createElement("img");
    img.src = url;
    img.alt = alt || "";
    const sel = window.getSelection();
    if (sel && sel.rangeCount && sel.anchorNode && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.appendChild(img);
    }
    sync();
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images = Array.from(items).filter((it) => it.kind === "file" && it.type.startsWith("image/"));
    if (images.length) {
      e.preventDefault(); // handle images ourselves; let non-image pastes fall through
      for (const it of images) {
        const f = it.getAsFile();
        if (f) void uploadImage(f);
      }
    }
  }

  function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) void uploadImage(f);
  }

  // ---- @-mentions ----------------------------------------------------------
  const matches =
    mQuery !== null
      ? people.filter((p) => p.name.toLowerCase().includes(mQuery.toLowerCase())).slice(0, 6)
      : [];
  const mOpen = mQuery !== null && matches.length > 0;

  function updateMention() {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.isCollapsed || !sel.anchorNode || !el.contains(sel.anchorNode) || sel.anchorNode.nodeType !== Node.TEXT_NODE) {
      setMQuery(null);
      return;
    }
    const before = (sel.anchorNode.textContent ?? "").slice(0, sel.anchorOffset);
    const m = before.match(/(?:^|\s)@(\S*)$/u);
    if (!m) {
      setMQuery(null);
      return;
    }
    setMQuery(m[1]);
    setMActive(0);
    const rect = sel.getRangeAt(0).cloneRange().getBoundingClientRect();
    setMPos({ left: rect.left, top: rect.bottom });
  }

  function insertMention(p: Person) {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || sel.anchorNode.nodeType !== Node.TEXT_NODE) return;
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    const full = node.textContent ?? "";
    const m = full.slice(0, offset).match(/(?:^|\s)@(\S*)$/u);
    if (!m) return;
    const at = offset - m[1].length - 1; // index of the "@"
    const chunk = `@${p.name} `;
    node.textContent = full.slice(0, at) + chunk + full.slice(offset);
    const pos = Math.min(at + chunk.length, (node.textContent ?? "").length);
    const range = document.createRange();
    range.setStart(node, pos);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    setMQuery(null);
    sync();
    ref.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (mOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMActive((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(matches[mActive]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMQuery(null);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  function exec(cmd: string, val?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    sync();
  }

  function addLink() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast.error("Select the text you want to turn into a link first.");
      return;
    }
    const url = window.prompt("Link URL (https://… or /path):", "https://");
    if (!url) return;
    exec("createLink", url.trim());
  }

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
      className="flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-content"
    >
      {children}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-inset ring-line-strong focus-within:ring-2 focus-within:ring-brand-500">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-canvas/60 px-1.5 py-1">
        <Btn onClick={() => exec("bold")} title="Bold (Ctrl+B)">
          <span className="font-bold">B</span>
        </Btn>
        <Btn onClick={() => exec("italic")} title="Italic (Ctrl+I)">
          <span className="italic">I</span>
        </Btn>
        <Btn onClick={() => exec("insertUnorderedList")} title="Bulleted list">
          <span className="text-base leading-none">•</span>
        </Btn>
        <Btn onClick={() => exec("insertOrderedList")} title="Numbered list">
          <span className="text-xs font-semibold">1.</span>
        </Btn>
        <Btn onClick={addLink} title="Link">
          <Icon name="link" className="size-4" />
        </Btn>
        <label
          title="Insert image"
          className={cn(
            "flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-1.5 text-muted transition-colors hover:bg-surface hover:text-content",
            uploading && "pointer-events-none opacity-50",
          )}
        >
          <Icon name="image" className={cn("size-4", uploading && "animate-pulse")} />
          <input type="file" accept="image/*" multiple className="hidden" onChange={onPickImage} disabled={uploading} />
        </label>
        <span className="ml-auto pr-1 text-[11px] text-faint">Paste an image to attach it</span>
      </div>

      <div className="relative">
        {empty && <p className="pointer-events-none absolute left-3 top-2.5 text-sm text-faint">{placeholder}</p>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={() => {
            sync();
            updateMention();
          }}
          onKeyDown={onKeyDown}
          onKeyUp={updateMention}
          onMouseUp={updateMention}
          onPaste={onPaste}
          onBlur={() => setTimeout(() => setMQuery(null), 150)}
          className={cn(
            "min-h-[76px] max-h-80 overflow-y-auto px-3 py-2 text-sm leading-relaxed text-content focus:outline-none",
            "[&_strong]:font-semibold [&_em]:italic",
            "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
            "[&_a]:text-accent-strong [&_a]:underline",
            "[&_code]:rounded [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
            "[&_img]:my-1.5 [&_img]:max-h-64 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:ring-1 [&_img]:ring-inset [&_img]:ring-line",
          )}
        />
      </div>

      {mOpen && mPos && (
        <ul
          className="fixed z-50 max-h-56 w-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg"
          style={{ left: mPos.left, top: mPos.top + 4 }}
        >
          {matches.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(p);
                }}
                onMouseEnter={() => setMActive(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                  i === mActive ? "bg-accent-soft text-accent-strong" : "text-content hover:bg-canvas",
                )}
              >
                <span className="gradient-brand flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
