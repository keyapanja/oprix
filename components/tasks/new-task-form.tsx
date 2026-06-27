"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/projects/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { humanizeEnum } from "@/lib/format";
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

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function NewTaskForm({
  projects,
  employees,
  initialProjectId = "",
}: {
  projects: Proj[];
  employees: Emp[];
  initialProjectId?: string;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [serviceId, setServiceId] = useState(""); // a sub-category = "task type"
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [checkText, setCheckText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
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
    const picked = Array.from(e.target.files ?? []);
    setFiles((f) => [...f, ...picked]);
    e.target.value = "";
  }
  function removeFile(i: number) {
    setFiles((f) => f.filter((_, idx) => idx !== i));
  }

  function submit() {
    setError(null);
    if (!projectId) return setError("Pick a project");
    if (!name.trim()) return setError("Task name is required");
    start(async () => {
      const res = await createTask({
        projectId,
        name: name.trim(),
        description: description.trim() || null,
        serviceId: serviceId || null,
        priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        status: "TODO",
        dueDate: dueDate || null,
        assigneeIds,
        checklist,
      });
      if (res.error) return setError(res.error);
      if (!res.task) return;

      if (files.length) {
        try {
          const fd = new FormData();
          for (const f of files) fd.append("files", f);
          const up = await fetch(`/api/tasks/${res.task.id}/attachments`, { method: "POST", body: fd });
          if (!up.ok) {
            const j = await up.json().catch(() => null);
            const why =
              up.status === 413
                ? "the file is too large for the server/proxy"
                : j?.error || up.statusText || `HTTP ${up.status}`;
            setError(`Task created, but uploading files failed: ${why}`);
          }
        } catch {
          setError("Task created, but uploading files failed.");
        }
      }
      router.push(`/tasks/${res.task.id}`);
    });
  }

  const doneCount = checklist.filter((c) => c.isDone).length;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" required>
            <Combobox
              value={projectId}
              onChange={onProjectChange}
              placeholder="Select project"
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
          <Field label="Task name" htmlFor="t-name" required className="sm:col-span-2">
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
          <Field label="Priority">
            <Combobox value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))} />
          </Field>
          <Field label="Due date">
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

          {/* Checklist — seeded from the sub-category template; editable */}
          <Field label="Checklist" hint={checklist.length ? `${doneCount}/${checklist.length} done` : undefined} className="sm:col-span-2">
            <div>
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
            </div>
          </Field>

          {/* Attachments — stored on the server, not the database */}
          <Field label="Attachments" hint="Stored on the server" className="sm:col-span-2">
            <div>
              {files.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-canvas px-2.5 py-1.5 text-sm">
                      <Icon name="folder" className="size-4 shrink-0 text-faint" />
                      <span className="flex-1 truncate text-content">{f.name}</span>
                      <span className="shrink-0 text-xs text-faint">{fmtBytes(f.size)}</span>
                      <button type="button" onClick={() => removeFile(i)} className="shrink-0 text-faint hover:text-red-600" aria-label={`Remove ${f.name}`}>
                        <Icon name="x" className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface">
                <Icon name="plus" className="size-4" />
                Add files
                <input type="file" multiple className="hidden" onChange={onFilesPicked} />
              </label>
            </div>
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push("/tasks")}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create task"}</Button>
      </div>
    </div>
  );
}
