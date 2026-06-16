"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAnnouncement, deleteAnnouncement } from "@/lib/calendar/actions";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

type Ann = { id: string; title: string; body: string | null; dateISO: string };

export function AnnouncementActions({ announcement }: { announcement: Ann }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(announcement.title);
  const [body, setBody] = useState(announcement.body ?? "");
  const [date, setDate] = useState(announcement.dateISO);

  function save() {
    setError(null);
    if (!title.trim()) return setError("Title is required");
    const fd = new FormData();
    fd.set("title", title);
    fd.set("body", body);
    fd.set("date", date);
    start(async () => {
      const res = await updateAnnouncement(announcement.id, fd);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        toast.success("Announcement updated");
        router.refresh();
      }
    });
  }

  function onDelete() {
    start(async () => {
      const ok = await confirmDialog({
        message: `Delete "${announcement.title}"? This can't be undone.`,
        tone: "danger",
        confirmLabel: "Delete",
      });
      if (!ok) return;
      const res = await deleteAnnouncement(announcement.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Announcement deleted");
        router.refresh();
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
        <Modal onClose={() => setOpen(false)} title="Edit announcement">
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
                {error}
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <Field label="Date" className="w-44">
                <DatePicker value={date} onChange={setDate} />
              </Field>
              <Field label="Title" className="min-w-56 flex-1">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            </div>
            <Field label="Details">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional details…" />
            </Field>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={pending || !title.trim()}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
