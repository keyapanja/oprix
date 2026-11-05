"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createAnnouncement,
  deleteAnnouncementAttachment,
  updateAnnouncement,
} from "@/lib/calendar/actions";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { RichTextEditor } from "@/components/kb/rich-text-editor";
import { FilePreviewGrid, makePicked, type PickedFile } from "@/components/attachments/file-preview-grid";
import { toast } from "@/components/ui/toast";

export type AnnouncementAttachment = { id: string; fileName: string; mimeType: string | null };

export type EditableAnnouncement = {
  id: string;
  title: string;
  body: string | null;
  dateISO: string;
  attachments: AnnouncementAttachment[];
};

/**
 * The one announcement form — the calendar's panel, the pop-up from clicking
 * a date, and the edit dialog all use it, so every way of posting has the same
 * fields: date, title, rich-text details and attachments. Given `existing`,
 * it edits: files can be removed (on Save) and more added.
 */
export function AnnouncementForm({
  initialDate = "",
  existing,
  onDone,
  onCancel,
}: {
  initialDate?: string;
  existing?: EditableAnnouncement;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(existing?.dateISO ?? initialDate);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0); // remounts the editor on reset

  const kept = (existing?.attachments ?? []).filter((a) => !removed.includes(a.id));

  function onFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    // Read the FileList synchronously: resetting e.target.value below empties
    // e.target.files, and React may run the state updater only afterwards — so
    // capture first, then reset, then append (otherwise the 2nd+ pick adds nothing).
    const picked = makePicked(e.target.files ?? []);
    e.target.value = "";
    setFiles((f) => [...f, ...picked]);
  }
  function removeFile(i: number) {
    setFiles((f) => {
      const p = f[i];
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return f.filter((_, idx) => idx !== i);
    });
  }

  async function submit() {
    setError(null);
    if (!date) return setError("Pick a date");
    if (!title.trim()) return setError("Title is required");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("date", date);
      fd.append("title", title.trim());
      fd.append("body", body);

      let id: string;
      if (existing) {
        const res = await updateAnnouncement(existing.id, fd);
        if (res.error) return setError(res.error);
        id = existing.id;
        for (const attId of removed) {
          const r = await deleteAnnouncementAttachment(attId);
          if (r.error) toast.error(`Saved, but a file couldn't be removed: ${r.error}`);
        }
      } else {
        const res = await createAnnouncement({}, fd);
        if (res.error || !res.id) return setError(res.error || "Couldn't post the announcement.");
        id = res.id;
      }

      if (files.length) {
        const up = new FormData();
        for (const p of files) up.append("files", p.file);
        const r = await fetch(`/api/announcements/${id}/attachments`, { method: "POST", body: up });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          toast.error(`${existing ? "Saved" : "Announcement posted"}, but a file failed to upload: ${j?.error ?? r.statusText}`);
        }
      }

      toast.success(existing ? "Announcement updated" : "Announcement posted");
      for (const p of files) if (p.preview) URL.revokeObjectURL(p.preview);
      if (!existing) {
        setDate(initialDate);
        setTitle("");
        setBody("");
        setKey((k) => k + 1);
      }
      setFiles([]);
      setRemoved([]);
      router.refresh();
      onDone?.();
    } catch {
      setError(existing ? "Couldn't save the announcement." : "Couldn't post the announcement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Date" className="w-44">
          <DatePicker value={date} onChange={setDate} />
        </Field>
        <Field label="Title" htmlFor={existing ? `a-title-${existing.id}` : "a-title"} className="min-w-56 flex-1">
          <Input
            id={existing ? `a-title-${existing.id}` : "a-title"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Office closed early Friday"
          />
        </Field>
      </div>

      <Field label="Details">
        <RichTextEditor key={key} value={body} onChange={setBody} placeholder="Write the announcement — bold, headings, lists, links…" />
      </Field>

      <Field label="Attachments" hint="Images appear in the announcement; other files attach as downloads">
        <div>
          {kept.length > 0 && (
            <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {kept.map((a) => (
                <li key={a.id} className="group relative overflow-hidden rounded-lg ring-1 ring-inset ring-line">
                  <div className="flex aspect-[4/3] items-center justify-center bg-canvas">
                    {a.mimeType?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${a.id}`} alt={a.fileName} className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="folder" className="size-6 text-faint" />
                    )}
                  </div>
                  <p className="truncate px-1.5 py-1 text-[11px] text-muted">{a.fileName}</p>
                  <button
                    type="button"
                    onClick={() => setRemoved((r) => [...r, a.id])}
                    aria-label={`Remove ${a.fileName}`}
                    className="absolute right-1 top-1 rounded-full bg-surface/90 p-1 text-faint shadow-sm hover:text-red-600"
                  >
                    <Icon name="x" className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {removed.length > 0 && (
            <p className="mb-2 text-xs text-muted">
              {removed.length} file{removed.length === 1 ? "" : "s"} will be removed when you save ·{" "}
              <button type="button" className="font-medium text-content underline" onClick={() => setRemoved([])}>
                Undo
              </button>
            </p>
          )}
          <FilePreviewGrid files={files} onRemove={removeFile} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface">
            <Icon name="plus" className="size-4" />
            Add images or files
            <input type="file" multiple className="hidden" onChange={onFilesPicked} />
          </label>
        </div>
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && <p className="mr-auto text-xs text-red-600">{error}</p>}
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button onClick={submit} disabled={busy}>
          <Icon name={existing ? "check" : "bell"} className="size-4" />
          {busy ? (existing ? "Saving…" : "Posting…") : existing ? "Save" : "Post announcement"}
        </Button>
      </div>
    </div>
  );
}
