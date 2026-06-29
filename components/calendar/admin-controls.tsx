"use client";

import { Fragment, useActionState, useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createHoliday,
  createAnnouncement,
  type CalendarState,
} from "@/lib/calendar/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { RichTextEditor } from "@/components/kb/rich-text-editor";
import { FilePreviewGrid, makePicked, type PickedFile } from "@/components/attachments/file-preview-grid";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export function CalendarAdminControls() {
  const [tab, setTab] = useState<"holiday" | "announcement">("holiday");

  return (
    <Card className="mb-6 p-5">
      <div className="mb-4 inline-flex rounded-xl bg-canvas p-0.5">
        {(["holiday", "announcement"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
            )}
          >
            {t === "holiday" ? "Add holiday" : "Post announcement"}
          </button>
        ))}
      </div>

      {tab === "holiday" ? <HolidayForm /> : <AnnouncementForm />}
    </Card>
  );
}

function HolidayForm() {
  const [state, action, pending] = useActionState<CalendarState, FormData>(createHoliday, {});
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (state.ok) setKey((k) => k + 1);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Fragment key={key}>
        <Field label="Date" className="w-44">
          <DatePicker name="date" />
        </Field>
        <Field label="Holiday name" htmlFor="h-name" className="min-w-56 flex-1">
          <Input id="h-name" name="name" placeholder="e.g. Independence Day" required />
        </Field>
      </Fragment>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add holiday"}</Button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function AnnouncementForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0); // remounts the editor on reset

  function onFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    setFiles((f) => [...f, ...makePicked(e.target.files ?? [])]);
    e.target.value = "";
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
      const res = await createAnnouncement({}, fd);
      if (res.error || !res.id) {
        setError(res.error || "Couldn't post the announcement.");
        return;
      }
      if (files.length) {
        const up = new FormData();
        for (const p of files) up.append("files", p.file);
        const r = await fetch(`/api/announcements/${res.id}/attachments`, { method: "POST", body: up });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          toast.error(`Announcement posted, but a file failed to upload: ${j?.error ?? r.statusText}`);
        }
      }
      toast.success("Announcement posted");
      setDate("");
      setTitle("");
      setBody("");
      setFiles([]);
      setKey((k) => k + 1);
      router.refresh();
    } catch {
      setError("Couldn't post the announcement.");
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
        <Field label="Title" htmlFor="a-title" className="min-w-56 flex-1">
          <Input
            id="a-title"
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
          <FilePreviewGrid files={files} onRemove={removeFile} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface">
            <Icon name="plus" className="size-4" />
            Add images or files
            <input type="file" multiple className="hidden" onChange={onFilesPicked} />
          </label>
        </div>
      </Field>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={busy}>
          <Icon name="bell" className="size-4" />
          {busy ? "Posting…" : "Post announcement"}
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
