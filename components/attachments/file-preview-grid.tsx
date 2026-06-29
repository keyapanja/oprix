"use client";

import { Icon } from "@/components/ui/icons";

export type PickedFile = { file: File; preview: string | null };

/** Turn a FileList/File[] into preview-bearing entries (object URLs for images). */
export function makePicked(list: FileList | File[]): PickedFile[] {
  return Array.from(list).map((file) => ({
    file,
    preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
  }));
}

/** Grid preview of files selected in a form, before upload. Images show a
 *  thumbnail; everything else shows a labelled file tile. */
export function FilePreviewGrid({
  files,
  onRemove,
}: {
  files: PickedFile[];
  onRemove: (index: number) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {files.map((p, i) => (
        <div
          key={i}
          className="group relative aspect-square overflow-hidden rounded-lg bg-canvas ring-1 ring-inset ring-line"
        >
          {p.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.preview} alt={p.file.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
              <Icon name="folder" className="size-6 text-faint" />
              <span className="line-clamp-2 break-all text-[10px] text-muted">{p.file.name}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={`Remove ${p.file.name}`}
          >
            <Icon name="x" className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
