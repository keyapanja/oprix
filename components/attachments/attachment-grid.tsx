import { Icon } from "@/components/ui/icons";
import { safeHref } from "@/lib/url";

export type GridAttachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  title?: string | null;
  url?: string | null;
};

/**
 * Read-only grid of saved attachments. Images render as thumbnails; other files
 * and links render as labelled tiles. Files open via `/api/files/[id]`; links
 * open their (sanitised) URL. Works in server or client components.
 */
export function AttachmentGrid({ items }: { items: GridAttachment[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
      {items.map((a) => {
        const label = a.title || a.fileName;
        const isLink = !!a.url;
        const isImage = !isLink && !!a.mimeType?.startsWith("image/");
        const href = a.url ? safeHref(a.url) : `/api/files/${a.id}`;
        return (
          <a
            key={a.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-xl ring-1 ring-inset ring-line"
          >
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
          </a>
        );
      })}
    </div>
  );
}
