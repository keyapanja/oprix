"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAnnouncement } from "@/lib/calendar/actions";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icons";
import { AnnouncementForm, type EditableAnnouncement } from "@/components/calendar/announcement-form";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

export function AnnouncementActions({ announcement }: { announcement: EditableAnnouncement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  async function onDelete() {
    const ok = await confirmDialog({
      message: `Delete "${announcement.title}"? This can't be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      try {
        const res = await deleteAnnouncement(announcement.id);
        if (res?.error) toast.error(res.error);
        else {
          toast.success("Announcement deleted");
          router.refresh();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the announcement.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded p-1 text-faint transition-colors hover:bg-canvas hover:text-content"
          aria-label="Edit announcement"
        >
          <Icon name="pencil" className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="rounded p-1 text-faint transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
          aria-label="Delete announcement"
        >
          <Icon name="trash" className="size-3.5" />
        </button>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)} title="Edit announcement" size="lg">
          {/* The same form as posting — rich text and attachments included. */}
          <AnnouncementForm existing={announcement} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
