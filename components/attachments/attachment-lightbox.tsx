"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icons";

export type LightboxItem = {
  fileName: string;
  mimeType: string | null;
  href: string;
  title?: string | null;
};

/** Can this attachment be previewed inline (vs. just opened/downloaded)? */
export function isPreviewable(mimeType: string | null, isLink: boolean): boolean {
  if (isLink) return false; // external links open in a new tab
  return !!mimeType && (mimeType.startsWith("image/") || mimeType === "application/pdf");
}

/** Full-screen preview for an image or PDF attachment, on the same page. */
export function AttachmentLightbox({ item, onClose }: { item: LightboxItem; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  const isImage = !!item.mimeType?.startsWith("image/");
  const isPdf = item.mimeType === "application/pdf";
  const label = item.title || item.fileName;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onMouseDown={(e) => e.stopPropagation()}
            className="rounded-lg p-2 transition-colors hover:bg-white/10"
            aria-label="Open in new tab"
          >
            <Icon name="externalLink" className="size-5" />
          </a>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-white/10"
            aria-label="Close preview"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.href} alt={label} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : isPdf ? (
          <iframe src={item.href} title={label} className="h-full w-full rounded-lg bg-white" />
        ) : (
          <div className="rounded-2xl bg-surface p-8 text-center">
            <Icon name="folder" className="mx-auto size-10 text-faint" />
            <p className="mt-3 text-sm font-medium text-content">{label}</p>
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              Open / download
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
