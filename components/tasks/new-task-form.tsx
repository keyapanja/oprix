"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/projects/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { FilePreviewGrid, makePicked, type PickedFile } from "@/components/attachments/file-preview-grid";
import { toast } from "@/components/ui/toast";
import { formatBytes, humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/cn";

type Emp = { id: string; name: string };
type SubCat = {
  id: string;
  name: string;
  categoryName: string;
  primaryAssigneeId: string | null;
  checklist: string[];
};
type Proj = { id: string; name: string; subcategories: SubCat[] };
type CheckItem = { text: string; isDone: boolean };

/** Values carried over from an existing task (e.g. a client request), so the
 *  form opens already filled in and only the internal-only bits are left. */
export type TaskPrefill = {
  projectId: string;
  name: string;
  description: string;
  priority: string;
  dueDate: string;
  clientDeadline: string;
  assigneeIds: string[];
  /** Files already on the source task, offered for copying across. */
  attachments: { fileName: string; sizeBytes: number | null; isLink: boolean }[];
  /** Where it came from — the id drives the server-side file copy, the rest
   *  lets the form link back to the original. */
  source: { taskId: string; href: string; label: string; fromClient: boolean };
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/** One calendar day before the given YYYY-MM-DD (UTC), as YYYY-MM-DD. */
function dayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function NewTaskForm({
  projects,
  employees,
  initialProjectId = "",
  lockProject = false,
  prefill,
}: {
  projects: Proj[];
  employees: Emp[];
  initialProjectId?: string;
  /** When arriving from a project's page the project is fixed — show it, but
   *  don't let it be changed. */
  lockProject?: boolean;
  /** Copied from an existing task. Everything stays editable — the task type
   *  in particular has no equivalent on a client request and must be chosen. */
  prefill?: TaskPrefill;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(prefill?.projectId || initialProjectId);
  const [serviceId, setServiceId] = useState(""); // a sub-category = "task type"
  const [name, setName] = useState(prefill?.name ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [priority, setPriority] = useState(prefill?.priority ?? "MEDIUM");
  const [clientDeadline, setClientDeadline] = useState(prefill?.clientDeadline ?? "");
  const [dueDate, setDueDate] = useState(prefill?.dueDate ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(prefill?.assigneeIds ?? []);
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [noChecklist, setNoChecklist] = useState(false);
  const [clientVisible, setClientVisible] = useState(false);
  const [checkText, setCheckText] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  // Copying the source's files is the default; a big brief nobody needs on the
  // internal task shouldn't be duplicated on disk without a way to say no.
  const [copySourceFiles, setCopySourceFiles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  // All of the project's sub-categories (task types) — no department gating.
  const taskTypeOptions = useMemo(() => {
    if (!project) return [] as { value: string; label: string }[];
    return project.subcategories.map((s) => ({ value: s.id, label: `${s.categoryName} › ${s.name}` }));
  }, [project]);

  // Assignees can be anyone in the company (cross-department work is allowed).
  const availableAssignees = useMemo(
    () => employees.filter((e) => !assigneeIds.includes(e.id)),
    [employees, assigneeIds],
  );

  function onProjectChange(v: string) {
    setProjectId(v);
    setServiceId("");
    setAssigneeIds([]);
    setChecklist([]);
  }
  function onTaskTypeChange(v: string) {
    setServiceId(v);
    const sub = project?.subcategories.find((s) => s.id === v);
    setChecklist((sub?.checklist ?? []).map((text) => ({ text, isDone: false })));
    // Auto-add the category's primary assignee (if set + still a valid employee).
    const pid = sub?.primaryAssigneeId;
    if (pid && employees.some((e) => e.id === pid)) {
      setAssigneeIds((cur) => (cur.includes(pid) ? cur : [...cur, pid]));
    }
  }

  // Setting the client deadline auto-fills the due date to one day before.
  function onClientDeadlineChange(v: string) {
    setClientDeadline(v);
    if (v) setDueDate(dayBefore(v));
  }

  function addAssignee(id: string) {
    if (id && !assigneeIds.includes(id)) setAssigneeIds((l) => [...l, id]);
  }
  function removeAssignee(id: string) {
    setAssigneeIds((l) => l.filter((x) => x !== id));
  }
  function addCheckItem() {
    const t = checkText.trim();
    if (!t) return;
    setChecklist((l) => [...l, { text: t, isDone: false }]);
    setCheckText("");
  }
  function toggleCheck(i: number) {
    setChecklist((l) => l.map((c, idx) => (idx === i ? { ...c, isDone: !c.isDone } : c)));
  }
  function removeCheck(i: number) {
    setChecklist((l) => l.filter((_, idx) => idx !== i));
  }
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

  function submit() {
    setError(null);
    if (!projectId) return setError("Pick a project");
    if (!name.trim()) return setError("Task title is required");
    start(async () => {
      try {
        const res = await createTask({
          projectId,
          name: name.trim(),
          description: description.trim() || null,
          serviceId: serviceId || null,
          priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
          status: "TODO",
          dueDate: dueDate || null,
          clientDeadline: clientDeadline || null,
          assigneeIds,
          checklistEnabled: !noChecklist,
          checklist: noChecklist ? [] : checklist,
          clientVisible,
          copyAttachmentsFromTaskId:
            prefill && copySourceFiles && prefill.attachments.length ? prefill.source.taskId : undefined,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
        if (!res.task) return;

        // Files can go missing from disk between the request and this copy —
        // say so rather than letting the task open quietly short of its brief.
        if (prefill && copySourceFiles && prefill.attachments.length) {
          const got = res.attachmentsCopied ?? 0;
          if (got < prefill.attachments.length) {
            toast.error(
              `Task created, but ${prefill.attachments.length - got} of ${prefill.attachments.length} files couldn't be copied — they're no longer on the server.`,
            );
          }
        }

        if (files.length) {
          // The upload result is surfaced via a toast (not setError) because we
          // navigate to the task below — a toast survives the navigation (its host
          // lives in the app shell), so a failed upload never disappears silently.
          try {
            const fd = new FormData();
            for (const p of files) fd.append("files", p.file);
            const up = await fetch(`/api/tasks/${res.task.id}/attachments`, { method: "POST", body: fd });
            if (!up.ok) {
              const j = await up.json().catch(() => null);
              const why =
                up.status === 413
                  ? "the file is too large for the server/proxy"
                  : j?.error || up.statusText || `HTTP ${up.status}`;
              toast.error(`Task created, but the attachment upload failed: ${why}. Add it again from the task page.`);
            }
          } catch {
            toast.error("Task created, but the attachment upload failed. Add it again from the task page.");
          }
        }
        router.push(`/tasks/${res.task.id}`);
        router.refresh();
      } catch {
        setError(
          "Couldn't create the task. If this keeps happening, the database may be missing a recent update — run “npx prisma db push” (local) or redeploy (prod).",
        );
      }
    });
  }

  const doneCount = checklist.filter((c) => c.isDone).length;

  return (
    <div className="space-y-5">
      {prefill && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/10 dark:text-brand-200 dark:ring-brand-500/25">
          <Icon name="copy" className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0">
            Copied from{" "}
            <Link href={prefill.source.href} className="font-medium underline underline-offset-2">
              {prefill.source.label}
            </Link>
            .{" "}
            {prefill.source.fromClient
              ? "Pick a task type and adjust anything below — nothing is saved until you create it, and the client won't see this task."
              : "Adjust anything below — nothing is saved until you create it."}
          </p>
        </div>
      )}
      <Card className="p-5">
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" required hint={lockProject ? "Set from the project you came from" : undefined}>
            <Combobox
              value={projectId}
              onChange={onProjectChange}
              placeholder="Select project"
              disabled={lockProject}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field
            label="Task type"
            hint={!projectId ? "Pick a project first" : taskTypeOptions.length ? undefined : "This project has no task types yet"}
          >
            <Combobox
              value={serviceId}
              onChange={onTaskTypeChange}
              disabled={!projectId}
              emptyLabel="— None —"
              placeholder={projectId ? "— None —" : "—"}
              options={taskTypeOptions}
            />
          </Field>
          <Field label="Task Title" htmlFor="t-name" required className="sm:col-span-2">
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design the landing page" />
          </Field>
          <Field label="Description" htmlFor="t-desc" className="sm:col-span-2">
            <Textarea
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be done, context, links…"
            />
          </Field>

          {/* Attachments — moved up, with a preview grid */}
          <Field label="Attachments" className="sm:col-span-2">
            <div>
              {prefill && prefill.attachments.length > 0 && (
                <div className="mb-3 rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
                  <label className="flex cursor-pointer select-none items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={copySourceFiles}
                      onChange={(e) => setCopySourceFiles(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-content">
                        Copy {prefill.attachments.length} file
                        {prefill.attachments.length === 1 ? "" : "s"} from {prefill.source.label}
                      </span>
                      <span className="mt-1 block space-y-0.5">
                        {prefill.attachments.map((a, i) => (
                          <span key={i} className="flex items-center gap-1.5 text-xs text-muted">
                            <Icon name={a.isLink ? "link" : "folder"} className="size-3.5 shrink-0 text-faint" />
                            <span className="truncate">{a.fileName}</span>
                            {!a.isLink && a.sizeBytes != null && (
                              <span className="shrink-0 text-faint">{formatBytes(a.sizeBytes)}</span>
                            )}
                          </span>
                        ))}
                      </span>
                    </span>
                  </label>
                </div>
              )}
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
          <Field label="Client deadline" hint="Sets the due date a day earlier">
            <DatePicker value={clientDeadline} onChange={onClientDeadlineChange} />
          </Field>
          <Field label="Due date" hint="Auto-set to one day before the client deadline — editable" className="sm:col-span-2">
            <DatePicker value={dueDate} onChange={setDueDate} />
          </Field>

          {/* Assignees — anyone in the company (cross-department allowed) */}
          <Field
            label="Assignees"
            hint="Add the people who'll work on this task — anyone, any department"
            className="sm:col-span-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              {assigneeIds.length === 0 && <span className="text-sm text-muted">No one assigned yet</span>}
              {assigneeIds.map((id) => {
                const emp = empById.get(id);
                if (!emp) return null;
                return (
                  <span key={id} className="flex items-center gap-1.5 rounded-full bg-canvas py-1 pl-1 pr-2 text-sm text-content">
                    <span className="gradient-brand flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </span>
                    {emp.name}
                    <button type="button" onClick={() => removeAssignee(id)} className="text-faint hover:text-red-600" aria-label={`Remove ${emp.name}`}>
                      <Icon name="x" className="size-3.5" />
                    </button>
                  </span>
                );
              })}
              {availableAssignees.length > 0 && (
                <div className="w-52">
                  <Combobox
                    value=""
                    onChange={addAssignee}
                    placeholder="+ Add assignee"
                    options={availableAssignees.map((e) => ({ value: e.id, label: e.name }))}
                  />
                </div>
              )}
            </div>
          </Field>

          {/* Visible to client — exposes the task in the client portal + notifies them */}
          <Field label="Client portal" hint="Show this task to the project's client and notify them" className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-content">
              <input
                type="checkbox"
                checked={clientVisible}
                onChange={(e) => setClientVisible(e.target.checked)}
                className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
              />
              Make this task visible to the client
            </label>
          </Field>

          {/* Checklist — seeded from the sub-category template; editable. Or opt out. */}
          <Field label="Checklist" hint={!noChecklist && checklist.length ? `${doneCount}/${checklist.length} done` : undefined} className="sm:col-span-2">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm text-content">
                <input
                  type="checkbox"
                  checked={noChecklist}
                  onChange={(e) => setNoChecklist(e.target.checked)}
                  className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                />
                No checklist for this task
              </label>
              {!noChecklist && (
                <>
                  {checklist.length > 0 && (
                    <ul className="mb-2 space-y-1">
                      {checklist.map((it, i) => (
                        <li key={i} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-canvas">
                          <input
                            type="checkbox"
                            checked={it.isDone}
                            onChange={() => toggleCheck(i)}
                            className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                          />
                          <span className={cn("flex-1 text-sm", it.isDone ? "text-faint line-through" : "text-content")}>{it.text}</span>
                          <button type="button" onClick={() => removeCheck(i)} className="text-faint opacity-0 hover:text-red-600 group-hover:opacity-100" aria-label="Remove item">
                            <Icon name="trash" className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={checkText}
                      onChange={(e) => setCheckText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCheckItem();
                        }
                      }}
                      placeholder="Add a checklist item…"
                    />
                    <Button type="button" variant="secondary" onClick={addCheckItem} disabled={!checkText.trim()}>Add</Button>
                  </div>
                </>
              )}
            </div>
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push("/tasks")}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>{pending ? "Creating task…" : "Create task"}</Button>
      </div>
    </div>
  );
}
