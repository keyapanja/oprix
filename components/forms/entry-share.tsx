"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { setEntryShared } from "@/lib/forms/actions";

/**
 * An entry's own no-login page: share it, copy or open the link, or stop
 * sharing. Shown in the entry popup, and only on a form whose public link is
 * on. Anyone who can see the entry can copy a link that already exists; only
 * someone who could edit it can start or stop sharing.
 */
export function EntryShare({
  entryId,
  initialToken,
  canShare,
}: {
  entryId: string;
  initialToken: string | null;
  canShare: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [pending, start] = useTransition();
  const url = token ? `${window.location.origin}/fill/e/${token}` : null;

  if (!url && !canShare) return null;

  function setShared(shared: boolean) {
    start(async () => {
      const res = await setEntryShared(entryId, shared);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setToken(res.token ?? null);
      toast.success(shared ? "Public page ready — copy the link to share it" : "Sharing stopped — the link no longer works");
      router.refresh();
    });
  }

  async function stop() {
    const ok = await confirmDialog({
      title: "Stop sharing this entry?",
      message: "The link stops working immediately. Sharing it again later makes a new link.",
      confirmLabel: "Stop sharing",
      tone: "danger",
    });
    if (ok) setShared(false);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it by hand.");
    }
  }

  return (
    <div className="rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon name="link" className="size-4 text-faint" />
        <p className="text-sm font-medium text-content">Public page</p>
        <span className="text-xs text-muted">
          {url ? "Anyone with this link can view the entry — no login needed." : "Not shared."}
        </span>
      </div>
      {url ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Public entry link"
            className="min-w-0 flex-1 basis-64 rounded-lg bg-surface px-2.5 py-1.5 font-mono text-xs text-content ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-brand-500"
          />
          <Button variant="secondary" size="sm" onClick={copy}>
            <Icon name="copy" className="size-3.5" />
            Copy
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-content"
          >
            <Icon name="externalLink" className="size-3.5" />
            Open
          </a>
          {canShare && (
            <Button variant="ghost" size="sm" onClick={stop} disabled={pending}>
              {pending ? "Stopping…" : "Stop sharing"}
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button size="sm" onClick={() => setShared(true)} disabled={pending}>
            {pending ? "Sharing…" : "Share a public page"}
          </Button>
          <span className="text-xs text-muted">Makes a link anyone can open without logging in. You can stop sharing at any time.</span>
        </div>
      )}
    </div>
  );
}
