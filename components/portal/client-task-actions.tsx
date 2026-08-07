"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { clientUpdateTask, clientDeleteTask } from "@/lib/portal/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { FilePreviewGrid, makePicked, type PickedFile } from "@/components/attachments/file-preview-grid";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { humanizeEnum } from "@/lib/format";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

type Task = {
  id: string;
  name: string;
  description: string | null;
  priority: string;
  dueDate: string | null; // YYYY-MM-DD
  projectId: string;
};

/**
 * Edit / withdraw controls for a task the client raised. Mirrors the internal
 * task's edit + delete affordances, scoped to what the client owns.
 */
export function ClientTaskActions({ task }: { task: Task }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

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
  function clearFiles() {
    setFiles((f) => {
      f.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      return [];
    });
  }
  function cancelEdit() {
    clearFiles();
    setEditing(false);
    setError(null);
  }

  function save() {
    setError(null);
    if (!name.trim()) return setError("Give the task a name.");
    start(async () => {
      const res = await clientUpdateTask(task.id, {
        name: name.trim(),
        description: description.trim() || null,
        priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        dueDate: dueDate || null,
      });
      if (res.error) return setError(res.error);

      // Upload any newly-added files onto the existing task.
      let uploadFailed = false;
      if (files.length) {
        try {
          const fd = new FormData();
          for (const p of files) fd.append("files", p.file);
          const up = await fetch(`/api/portal/tasks/${task.id}/attachments`, { method: "POST", body: fd });
          if (!up.ok) {
            uploadFailed = true;
            const j = await up.json().catch(() => null);
            const why =
              up.status === 413 ? "the file is too large" : j?.error || up.statusText || `HTTP ${up.status}`;
            toast.error(`Saved, but the file upload failed: ${why}.`);
          }
        } catch {
          uploadFailed = true;
          toast.error("Saved, but the file upload failed.");
        }
      }

      if (!uploadFailed) toast.success("Task updated");
      clearFiles();
      setEditing(false);
      router.refresh();
    });
  }

  async function remove() {
    const ok = await confirmDialog({
      message: "Withdraw this task? Your team will be notified and it will be removed from the project.",
      tone: "danger",
      confirmLabel: "Withdraw task",
    });
    if (!ok) return;
    setBusy(true);
    const res = await clientDeleteTask(task.id);
    if (res.error) {
      setBusy(false);
      return toast.error(res.error);
    }
    toast.success("Task withdrawn");
    router.push(`/portal/projects/${task.projectId}`);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Icon name="pencil" className="size-4" /> Edit
        </Button>
        <Button variant="secondary" size="sm" onClick={remove} disabled={busy}>
          <Icon name="trash" className="size-4" /> {busy ? "Withdrawing…" : "Withdraw"}
        </Button>
      </div>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-content">Edit task</h3>
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Task" htmlFor="cte-name" required className="sm:col-span-2">
          <Input id="cte-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What do you need done?" />
        </Field>
        <Field label="Details" htmlFor="cte-desc" className="sm:col-span-2">
          <Textarea id="cte-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any context, links, or requirements…" />
        </Field>
        <Field label="Attachments" hint="Add more briefs, screenshots or reference files" className="sm:col-span-2">
          <div>
            <FilePreviewGrid files={files} onRemove={removeFile} />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface">
              <Icon name="plus" className="size-4" />
              Add files
              <input type="file" multiple className="hidden" onChange={onFilesPicked} />
            </label>
          </div>
        </Field>
        <Field label="Priority">
          <Combobox value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))} />
        </Field>
        <Field label="Due date">
          <DatePicker value={dueDate} onChange={setDueDate} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={cancelEdit} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending || !name.trim()}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}
