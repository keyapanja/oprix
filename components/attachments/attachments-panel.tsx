"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteAttachment } from "@/lib/projects/actions";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { safeHref } from "@/lib/url";
import { cn } from "@/lib/cn";

type Att = {
  id: string;
  fileName: string;
  title?: string | null;
  url?: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

function fmtBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Shared attachments list + uploader. Works for any owner (task, project, …) —
 * pass the matching upload endpoint as `uploadUrl`. Files are served via
 * `/api/files/[id]`; deletion goes through the shared `deleteAttachment` action.
 * With `allowLinks`, each attachment can be a file (optionally titled) OR a link.
 */
export function AttachmentsPanel({
  uploadUrl,
  canEdit,
  initial,
  allowLinks = false,
}: {
  uploadUrl: string;
  canEdit: boolean;
  initial: Att[];
  allowLinks?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"file" | "link">("file");
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  async function post(fd: FormData, okMsg: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      if (!res.ok) {
        let msg = "Upload failed";
        if (res.status === 413) {
          msg = "File too large for the server/proxy to accept.";
        } else {
          const j = await res.json().catch(() => null);
          msg = j?.error || `Upload failed (HTTP ${res.status})`;
        }
        toast.error(msg);
        return false;
      }
      toast.success(okMsg);
      router.refresh();
      return true;
    } catch {
      toast.error("Upload failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    // A custom title only makes sense for a single file.
    if (title.trim() && files.length === 1) fd.append("title", title.trim());
    const ok = await post(fd, files.length > 1 ? `${files.length} files uploaded` : "File uploaded");
    if (ok) setTitle("");
  }

  async function addLink() {
    const u = linkUrl.trim();
    if (!u) {
      toast.error("Enter a link URL.");
      return;
    }
    const fd = new FormData();
    fd.append("url", u);
    if (title.trim()) fd.append("title", title.trim());
    const ok = await post(fd, "Link added");
    if (ok) {
      setTitle("");
      setLinkUrl("");
    }
  }

  async function onDelete(att: Att) {
    const label = att.title || att.fileName;
    const ok = await confirmDialog({
      message: `Delete "${label}"? This can't be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteAttachment(att.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Attachment deleted");
        router.refresh();
      }
    });
  }

  return (
    <div>
      {initial.length === 0 ? (
        <p className="text-sm text-muted">No attachments yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {initial.map((a) => {
            const label = a.title || a.fileName;
            const isLink = !!a.url;
            return (
              <li key={a.id} className="flex items-center gap-2 rounded-lg bg-canvas px-2.5 py-2 text-sm">
                <Icon name={isLink ? "externalLink" : "folder"} className="size-4 shrink-0 text-faint" />
                <a
                  href={a.url ? safeHref(a.url) : `/api/files/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate font-medium text-content hover:text-accent-strong hover:underline"
                >
                  {label}
                </a>
                {isLink ? (
                  <span className="shrink-0 text-xs text-faint">Link</span>
                ) : (
                  a.sizeBytes != null && <span className="shrink-0 text-xs text-faint">{fmtBytes(a.sizeBytes)}</span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onDelete(a)}
                    disabled={pending}
                    className="shrink-0 text-faint hover:text-red-600 disabled:opacity-50"
                    aria-label={`Delete ${label}`}
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && allowLinks && (
        <div className="mt-3 rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
          <div className="mb-2 inline-flex rounded-lg bg-surface p-0.5">
            {(["file", "link"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  mode === m ? "bg-canvas text-content shadow-sm" : "text-muted hover:text-content",
                )}
              >
                {m === "file" ? "Upload file" : "Add link"}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" />
            {mode === "file" ? (
              <label
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-canvas",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                <Icon name="plus" className="size-4" />
                {busy ? "Uploading…" : "Choose file(s)"}
                <input type="file" multiple className="hidden" disabled={busy} onChange={onFilesPicked} />
              </label>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
                </div>
                <Button size="sm" onClick={addLink} disabled={busy} className="shrink-0 whitespace-nowrap">
                  {busy ? "Adding…" : "Add link"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {canEdit && !allowLinks && (
        <label
          className={cn(
            "mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <Icon name="plus" className="size-4" />
          {busy ? "Uploading…" : "Add files"}
          <input type="file" multiple className="hidden" disabled={busy} onChange={onFilesPicked} />
        </label>
      )}
    </div>
  );
}
