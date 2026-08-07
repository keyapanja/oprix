"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

type Att = { id: string; fileName: string; mimeType: string | null; sizeBytes: number | null };

function humanSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files on a client task: download links, plus remove (when the client raised
 *  the task). Serving/removal go through the portal-scoped /api/portal/files. */
export function PortalAttachments({ attachments, canManage }: { attachments: Att[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (!attachments.length) return <p className="text-sm text-muted">No files attached.</p>;

  async function remove(a: Att) {
    const ok = await confirmDialog({ message: `Remove “${a.fileName}”?`, tone: "danger", confirmLabel: "Remove" });
    if (!ok) return;
    setBusy(a.id);
    const res = await fetch(`/api/portal/files/${a.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return toast.error(j?.error || "Couldn't remove the file.");
    }
    toast.success("File removed");
    router.refresh();
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {attachments.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <a
            href={`/api/portal/files/${a.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2 text-sm text-content hover:text-accent-strong"
          >
            <Icon name="folder" className="size-4 shrink-0 text-faint" />
            <span className="truncate">{a.fileName}</span>
            {a.sizeBytes ? <span className="shrink-0 text-xs text-faint">{humanSize(a.sizeBytes)}</span> : null}
          </a>
          {canManage && (
            <button
              type="button"
              onClick={() => remove(a)}
              disabled={busy === a.id}
              className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
              aria-label={`Remove ${a.fileName}`}
            >
              <Icon name="trash" className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
