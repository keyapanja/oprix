"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { rotatePublicLink } from "@/lib/forms/actions";

/**
 * The shareable URL for a form's no-login page, with copy and "new link".
 * The token only exists once the form has been saved with the link switched
 * on, so until then this explains that rather than showing a broken URL.
 */
export function PublicLink({
  formId,
  token,
  published,
}: {
  formId: string;
  token: string | null;
  published: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(token);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = current ? `${origin}/fill/${current}` : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it by hand.");
    }
  }

  async function rotate() {
    const ok = await confirmDialog({
      title: "Replace the public link?",
      message: "The current link stops working immediately. Anyone you've already sent it to will need the new one.",
      confirmLabel: "Replace link",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await rotatePublicLink(formId);
      if (res.error || !res.token) {
        toast.error(res.error ?? "Couldn't replace the link.");
        return;
      }
      setCurrent(res.token);
      toast.success("New link ready — the old one is dead");
      router.refresh();
    });
  }

  if (!url) {
    return (
      <p className="rounded-lg bg-canvas px-2.5 py-2 text-xs text-muted ring-1 ring-inset ring-line">
        Save the form to generate the link.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg bg-canvas p-2.5 ring-1 ring-inset ring-line">
      <div className="flex items-center gap-1.5">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-content outline-none"
          aria-label="Public form link"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded-md p-1 text-faint transition-colors hover:bg-surface hover:text-content"
          title="Copy link"
          aria-label="Copy link"
        >
          <Icon name="copy" className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">
          {published ? "Live for anyone who has it." : "Works once the form is published."}
        </span>
        <Button variant="ghost" size="sm" onClick={rotate} disabled={pending} className="h-7 px-2 text-xs">
          {pending ? "Replacing…" : "New link"}
        </Button>
      </div>
    </div>
  );
}
