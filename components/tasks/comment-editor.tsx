"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { renderMarkdown } from "@/lib/kb/markdown";
import { htmlToMarkdown } from "@/components/kb/rich-text-editor";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Person = { id: string; name: string };
type Img = { url: string; name: string };

const IMG_MD = /!\[([^\]]*)\]\((\/[^\s)]*|https?:\/\/[^\s)]+)\)/g;

// Split a Markdown body into its text (images stripped) and the images, so an
// existing comment re-opens with its images back in the thumbnail strip.
function splitImages(md: string): { text: string; imgs: Img[] } {
  const imgs: Img[] = [];
  const text = (md ?? "")
    .replace(IMG_MD, (_m, alt: string, url: string) => {
      imgs.push({ url, name: alt || "image" });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, imgs };
}

// Keep alt text from breaking Markdown link syntax.
const cleanAlt = (s: string) => s.replace(/[[\]()]/g, "").trim();

/**
 * Compact rich-text comment editor. Text is a contentEditable that serializes to
 * Markdown (reusing the KB editor's htmlToMarkdown + the XSS-safe renderMarkdown),
 * with **bold / italic / lists / links** and @-mentions. Images — pasted from the
 * clipboard or picked with the image button — upload to `uploadUrl` and appear as
 * **thumbnail chips** above the text (not inline); on submit they're appended to
 * the body as ![](…). The combined Markdown is emitted through `onChange`.
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
  const imagesRef = useRef<Img[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [empty, setEmpty] = useState(!value?.trim());
  const [uploading, setUploading] = useState(false);
  const [mQuery, setMQuery] = useState<string | null>(null);
  const [mActive, setMActive] = useState(0);
  const [mPos, setMPos] = useState<{ left: number; top: number } | null>(null);

  // Seed once from the initial Markdown: text into the editor, images into chips.
  useEffect(() => {
    const el = ref.current;
    if (el && !inited.current) {
      const { text, imgs } = splitImages(value);
      el.innerHTML = text ? renderMarkdown(text) : "";
      imagesRef.current = imgs;
      setImages(imgs);
      setEmpty(!text.trim() && imgs.length === 0);
      inited.current = true;
      if (autoFocus) el.focus();
    }
  }, [value, autoFocus]);

  // Emit the combined Markdown: text, then each image as ![](…).
  function emit(imgs: Img[]) {
    const el = ref.current;
    const textMd = el ? htmlToMarkdown(el) : "";
    const imgMd = imgs.map((i) => `![${cleanAlt(i.name)}](${i.url})`).join("\n\n");
    onChange([textMd, imgMd].filter((s) => s && s.trim()).join("\n\n"));
    setEmpty(!el?.textContent?.trim() && imgs.length === 0);
  }

  function updateImages(next: Img[]) {
    imagesRef.current = next;
    setImages(next);
    emit(next);
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
      if (j.url) updateImages([...imagesRef.current, { url: j.url, name: file.name || "image" }]);
    } catch {
      toast.error("Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pics = Array.from(items).filter((it) => it.kind === "file" && it.type.startsWith("image/"));
    if (pics.length) {
      e.preventDefault(); // capture images ourselves; non-image pastes fall through
      for (const it of pics) {
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

  function removeImage(i: number) {
    updateImages(imagesRef.current.filter((_, idx) => idx !== i));
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
    emit(imagesRef.current);
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
    emit(imagesRef.current);
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
      </div>

      {/* Thumbnail chips for attached images (paste / pick) */}
      {(images.length > 0 || uploading) && (
        <div className="flex flex-wrap gap-2 px-3 pt-2.5">
          {images.map((img, i) => (
            <div key={`${img.url}-${i}`} className="group relative size-16 overflow-hidden rounded-lg ring-1 ring-inset ring-line-strong">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Remove ${img.name}`}
              >
                <Icon name="x" className="size-3" />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex size-16 items-center justify-center rounded-lg text-faint ring-1 ring-inset ring-line">
              <Icon name="image" className="size-5 animate-pulse" />
            </div>
          )}
        </div>
      )}

      <div className="relative">
        {empty && <p className="pointer-events-none absolute left-3 top-2.5 text-sm text-faint">{placeholder}</p>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={() => {
            emit(imagesRef.current);
            updateMention();
          }}
          onKeyDown={onKeyDown}
          onKeyUp={updateMention}
          onMouseUp={updateMention}
          onPaste={onPaste}
          onBlur={() => setTimeout(() => setMQuery(null), 150)}
          className={cn(
            "min-h-[60px] max-h-80 overflow-y-auto px-3 py-2 text-sm leading-relaxed text-content focus:outline-none",
            "[&_strong]:font-semibold [&_em]:italic",
            "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
            "[&_a]:text-accent-strong [&_a]:underline",
            "[&_code]:rounded [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
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
