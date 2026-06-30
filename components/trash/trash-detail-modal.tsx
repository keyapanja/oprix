"use client";

import { Fragment } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TrashItem, TrashType } from "@/lib/trash/data";
import { formatDateTime } from "@/lib/format";

const TONE: Record<TrashType, "gray" | "green" | "amber" | "blue" | "red"> = {
  project: "blue",
  client: "green",
  employee: "amber",
  task: "blue",
  leave: "amber",
  announcement: "red",
  kb: "gray",
  holiday: "green",
  form: "blue",
  formEntry: "gray",
};

/** Read-only detail popup for a single trashed item, with a Restore action. */
export function TrashDetailModal({
  item,
  onClose,
  onRestore,
  onPurge,
  restoring,
  purging,
}: {
  item: TrashItem;
  onClose: () => void;
  onRestore: () => void;
  onPurge: () => void;
  restoring: boolean;
  purging: boolean;
}) {
  return (
    <Modal onClose={onClose} title="Trashed item">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Badge tone={TONE[item.type]} className="mt-0.5 shrink-0">
            {item.typeLabel}
          </Badge>
          <h3 className="text-lg font-semibold text-content">{item.label}</h3>
        </div>

        <dl className="grid grid-cols-3 gap-x-3 gap-y-2.5 border-t border-line pt-3 text-sm">
          {item.details.map((d) => (
            <Fragment key={d.label}>
              <dt className="text-faint">{d.label}</dt>
              <dd className="col-span-2 whitespace-pre-wrap break-words text-content">{d.value}</dd>
            </Fragment>
          ))}
          <dt className="text-faint">Deleted</dt>
          <dd className="col-span-2 text-content">
            {formatDateTime(item.deletedAt)}
            {item.deletedByName ? ` · by ${item.deletedByName}` : ""}
          </dd>
        </dl>

        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          <Button variant="danger" onClick={onPurge} disabled={purging || restoring}>
            {purging ? "Deleting…" : "Delete permanently"}
          </Button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-content"
            >
              Close
            </button>
            <Button onClick={onRestore} disabled={restoring || purging}>
              {restoring ? "Restoring…" : "Restore"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
