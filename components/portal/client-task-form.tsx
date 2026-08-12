"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { clientCreateTask } from "@/lib/portal/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { FilePreviewGrid, makePicked, type PickedFile } from "@/components/attachments/file-preview-grid";
import { toast } from "@/components/ui/toast";
import { humanizeEnum } from "@/lib/format";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

type ProjectOpt = { id: string; name: string; bmName: string | null };

/**
 * A simplified task-request form for the client. On a project page the project
 * is fixed (pass `fixedProjectId`); on the dashboard the client picks from their
 * projects. The assignee (Business Manager) is derived per project and shown
 * read-only. The client just adds a title, details, priority, and a due date.
 */
export function ClientTaskForm({
  projects,
  fixedProjectId,
}: {
  projects: ProjectOpt[];
  /** When set, the project is locked (read-only) to this id — used on a project page. */
  fixedProjectId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selId, setSelId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fixed = !!fixedProjectId;
  const sel = projects.find((p) => p.id === selId) ?? null;
  const bmName = sel?.bmName ?? null;

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

  function reset() {
    setName("");
    setDescription("");
    setPriority("MEDIUM");
    setDueDate("");
    setFiles((f) => {
      f.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      return [];
    });
    setError(null);
  }

  function close() {
    reset();
    setOpen(false);
  }

  // Escape closes the modal; lock background scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit() {
    setError(null);
    if (!selId) return setError("Pick a project.");
    if (!bmName) return setError("This project has no Business Manager yet.");
    if (!name.trim()) return setError("Give the task a name.");
    start(async () => {
      const res = await clientCreateTask({
        projectId: selId,
        name: name.trim(),
        description: description.trim() || null,
        priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        dueDate: dueDate || null,
      });
      if (res.error) return setError(res.error);

      // Upload any attachments to the just-created task. The task is already
      // sent, so a failed upload is surfaced (toast) but doesn't block success.
      let uploadFailed = false;
      if (files.length && res.taskId) {
        try {
          const fd = new FormData();
          for (const p of files) fd.append("files", p.file);
          const up = await fetch(`/api/portal/tasks/${res.taskId}/attachments`, { method: "POST", body: fd });
          if (!up.ok) {
            uploadFailed = true;
            const j = await up.json().catch(() => null);
            const why =
              up.status === 413 ? "the file is too large" : j?.error || up.statusText || `HTTP ${up.status}`;
            toast.error(`Task sent, but the file upload failed: ${why}.`);
          }
        } catch {
          uploadFailed = true;
          toast.error("Task sent, but the file upload failed.");
        }
      }

      if (!uploadFailed) toast.success("Task sent to your Business Manager");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  // On a project page with no BM, explain instead of offering the button.
  if (fixed && !bmName) {
    return (
      <Card className="p-4 text-sm text-muted">
        A Business Manager hasn&apos;t been assigned to this project yet, so you can&apos;t raise a task here. Your team will set one up.
      </Card>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" className="size-4" /> Raise a task
      </Button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center"
            onMouseDown={close}
            role="dialog"
            aria-modal="true"
          >
            <Card className="my-4 w-full max-w-2xl p-5 sm:my-0" onMouseDown={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-content">Raise a task</h3>
                <button type="button" onClick={close} className="text-faint hover:text-content" aria-label="Close">
                  <Icon name="x" className="size-4" />
                </button>
              </div>

              {error && (
                <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project" required>
                  {fixed ? (
                    <div className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted ring-1 ring-inset ring-line">{sel?.name ?? "—"}</div>
                  ) : (
                    <Combobox
                      value={selId}
                      onChange={setSelId}
                      placeholder="Select a project"
                      options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  )}
                </Field>
                <Field label="Assigned to">
                  <div className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted ring-1 ring-inset ring-line">
                    {bmName ?? "No Business Manager yet"}
                  </div>
                </Field>
                <Field label="Task" htmlFor="ct-name" required className="sm:col-span-2">
                  <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What do you need done?" />
                </Field>
                <Field label="Details" htmlFor="ct-desc" className="sm:col-span-2">
                  <Textarea id="ct-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any context, links, or requirements…" />
                </Field>
                <Field label="Attachments" hint="Share briefs, screenshots or reference files" className="sm:col-span-2">
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

              {selId && !bmName && (
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                  This project doesn&apos;t have a Business Manager yet — pick another project, or ask your team to assign one.
                </p>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <Button variant="secondary" onClick={close}>Cancel</Button>
                <Button onClick={submit} disabled={pending || !name.trim() || !bmName || !selId}>{pending ? "Sending…" : "Send task"}</Button>
              </div>
            </Card>
          </div>,
          document.body,
        )}
    </>
  );
}
