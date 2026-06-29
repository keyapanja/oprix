"use client";

import { Modal } from "@/components/ui/modal";
import { AttachmentGrid } from "@/components/attachments/attachment-grid";
import { formatDate, formatDateTime } from "@/lib/format";
import { renderMarkdown } from "@/lib/kb/markdown";

export type CalendarDetail =
  | { kind: "holiday"; title: string; dateISO: string }
  | {
      kind: "announcement";
      title: string;
      body: string | null;
      dateISO: string;
      authorName: string | null;
      postedAt: string;
      attachments: { id: string; fileName: string; mimeType: string | null }[];
    };

/** Read-only detail popup for a calendar holiday or announcement. */
export function CalendarDetailModal({ item, onClose }: { item: CalendarDetail; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title={item.kind === "holiday" ? "Holiday" : "Announcement"}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 size-2.5 shrink-0 rounded-full ${item.kind === "holiday" ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          <h3 className="text-lg font-semibold text-content">{item.title}</h3>
        </div>

        <dl className="grid grid-cols-3 gap-x-3 gap-y-2.5 text-sm">
          <dt className="text-faint">Date</dt>
          <dd className="col-span-2 text-content">{formatDate(item.dateISO)}</dd>
          {item.kind === "announcement" && (
            <>
              <dt className="text-faint">Posted by</dt>
              <dd className="col-span-2 text-content">{item.authorName ?? "—"}</dd>
              <dt className="text-faint">Posted on</dt>
              <dd className="col-span-2 text-content">{formatDateTime(item.postedAt)}</dd>
            </>
          )}
        </dl>

        {item.kind === "announcement" && (
          <div className="space-y-3 border-t border-line pt-3">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Details</p>
              {item.body ? (
                <div
                  className="text-sm text-content [&_a]:text-accent-strong [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-brand-500 [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_code]:rounded [&_code]:bg-canvas [&_code]:px-1 [&_h1]:mt-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-2 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(item.body) }}
                />
              ) : (
                <p className="text-sm text-muted">No details.</p>
              )}
            </div>

            {item.attachments.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Attachments</p>
                <AttachmentGrid items={item.attachments} />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
