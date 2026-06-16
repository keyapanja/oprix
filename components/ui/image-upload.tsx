"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";

/**
 * Image preview + upload/remove against an endpoint that handles POST
 * (multipart field "file") and DELETE. The caller supplies the preview node
 * (an <Avatar> or a square <img>). Refreshes the route on success.
 */
export function ImageUpload({
  endpoint,
  hasImage,
  preview,
  hint,
}: {
  endpoint: string;
  hasImage: boolean;
  preview: ReactNode;
  hint?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Upload failed");
      } else {
        toast.success("Image updated");
        router.refresh();
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Couldn't remove");
      } else {
        toast.success("Image removed");
        router.refresh();
      }
    } catch {
      toast.error("Couldn't remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {preview}
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-2">
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface ${
              busy ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <Icon name="plus" className="size-4" />
            {busy ? "Working…" : hasImage ? "Change" : "Upload"}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={onPick} />
          </label>
          {hasImage && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="rounded-xl px-2.5 py-2 text-sm font-medium text-faint transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
            >
              Remove
            </button>
          )}
        </div>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
    </div>
  );
}
