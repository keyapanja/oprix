"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { safeHref } from "@/lib/url";
import { AttachmentLightbox, isPreviewable, type LightboxItem } from "@/components/attachments/attachment-lightbox";

export type GridAttachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  title?: string | null;
  url?: string | null;
};

/**
 * Read-only grid of saved attachments. Images render as thumbnails; other files
 * and links render as labelled tiles. Images/PDFs preview in an on-page modal;
 * other files and external links open in a new tab.
 */
export function AttachmentGrid({ items }: { items: GridAttachment[] }) {
  const [preview, setPreview] = useState<LightboxItem | null>(null);
  if (!items.length) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {items.map((a) => {
          const label = a.title || a.fileName;
          const isLink = !!a.url;
          const isImage = !isLink && !!a.mimeType?.startsWith("image/");
          const href = a.url ? safeHref(a.url) : `/api/files/${a.id}`;
          const canPreview = isPreviewable(a.mimeType, isLink);
          const cls = "group block overflow-hidden rounded-xl text-left ring-1 ring-inset ring-line";
          const inner = (
            <>
              <div className="flex aspect-[4/3] items-center justify-center bg-canvas">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={href} alt={label} className="h-full w-full object-cover" />
                ) : (
                  <Icon name={isLink ? "externalLink" : "folder"} className="size-8 text-faint" />
                )}
              </div>
              <div className="px-2.5 py-2">
                <p className="truncate text-xs font-medium text-content group-hover:text-accent-strong">{label}</p>
                {isLink && <p className="text-[10px] text-faint">Link</p>}
              </div>
            </>
          );
          return canPreview ? (
            <button
              key={a.id}
              type="button"
              onClick={() => setPreview({ fileName: a.fileName, mimeType: a.mimeType, href, title: a.title })}
              className={cls + " w-full"}
            >
              {inner}
            </button>
          ) : (
            <a key={a.id} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
              {inner}
            </a>
          );
        })}
      </div>
      {preview && <AttachmentLightbox item={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
