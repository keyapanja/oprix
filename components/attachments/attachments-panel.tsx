"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteAttachment } from "@/lib/projects/actions";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

type Att = {
  id: string;
  fileName: string;
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
 */
export function AttachmentsPanel({
  uploadUrl,
  canEdit,
  initial,
}: {
  uploadUrl: string;
  canEdit: boolean;
  initial: Att[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();

  async function onFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
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
      } else {
        toast.success(files.length > 1 ? `${files.length} files uploaded` : "File uploaded");
        router.refresh();
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(att: Att) {
    const ok = await confirmDialog({
      message: `Delete "${att.fileName}"? This can't be undone.`,
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
        <p className="text-sm text-muted">No files attached.</p>
      ) : (
        <ul className="space-y-1.5">
          {initial.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg bg-canvas px-2.5 py-2 text-sm">
              <Icon name="folder" className="size-4 shrink-0 text-faint" />
              <a
                href={`/api/files/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate font-medium text-content hover:text-accent-strong hover:underline"
              >
                {a.fileName}
              </a>
              {a.sizeBytes != null && <span className="shrink-0 text-xs text-faint">{fmtBytes(a.sizeBytes)}</span>}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onDelete(a)}
                  disabled={pending}
                  className="shrink-0 text-faint hover:text-red-600 disabled:opacity-50"
                  aria-label={`Delete ${a.fileName}`}
                >
                  <Icon name="trash" className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <label
          className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface ${
            uploading ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Icon name="plus" className="size-4" />
          {uploading ? "Uploading…" : "Add files"}
          <input type="file" multiple className="hidden" disabled={uploading} onChange={onFilesPicked} />
        </label>
      )}
    </div>
  );
}
