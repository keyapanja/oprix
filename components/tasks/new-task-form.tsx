"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/projects/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/cn";

type Emp = { id: string; name: string };
type Svc = { id: string; name: string; primaryAssigneeId: string | null; checklist: string[] };
type Proj = { id: string; name: string; services: Svc[] };
type CheckItem = { text: string; isDone: boolean };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"];

export function NewTaskForm({ projects, employees }: { projects: Proj[]; employees: Emp[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [status, setStatus] = useState("TODO");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [checkText, setCheckText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const serviceOpts = useMemo(() => {
    const p = projects.find((x) => x.id === projectId);
    return (p?.services ?? []).map((s) => ({ value: s.id, label: s.name }));
  }, [projects, projectId]);

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

  // Picking a service pre-fills its primary assignee + checklist (both editable below).
  function onServiceChange(v: string) {
    setServiceId(v);
    const svc = projects.find((p) => p.id === projectId)?.services.find((s) => s.id === v);
    setAssigneeIds(svc?.primaryAssigneeId ? [svc.primaryAssigneeId] : []);
    setChecklist((svc?.checklist ?? []).map((text) => ({ text, isDone: false })));
  }

  function addAssignee(id: string) {
    if (!id || assigneeIds.includes(id)) return;
    setAssigneeIds((l) => [...l, id]);
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

  function submit() {
    setError(null);
    if (!projectId) return setError("Pick a project");
    if (!name.trim()) return setError("Task name is required");
    start(async () => {
      const res = await createTask({
        projectId,
        name: name.trim(),
        serviceId: serviceId || null,
        priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        status: status as "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED",
        dueDate: dueDate || null,
        assigneeIds,
        checklist,
      });
      if (res.error) setError(res.error);
      else if (res.task) router.push(`/tasks/${res.task.id}`);
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
          <Field label="Service" hint={projectId ? undefined : "Pick a project first"}>
            <Combobox
              value={serviceId}
              onChange={onServiceChange}
              disabled={!projectId}
              emptyLabel="— None —"
              placeholder={projectId ? "— None —" : "—"}
              options={serviceOpts}
            />
          </Field>
          <Field label="Task name" htmlFor="t-name" required className="sm:col-span-2">
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design the landing page" />
          </Field>
          <Field label="Priority">
            <Combobox value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))} />
          </Field>
          <Field label="Status">
            <Combobox value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: humanizeEnum(s) }))} />
          </Field>
          <Field label="Due date">
            <DatePicker value={dueDate} onChange={setDueDate} />
          </Field>

          {/* Assignees — primary pre-selected on service pick; editable here */}
          <Field
            label="Assignees"
            hint={serviceId ? "Service primary pre-selected — remove or add more" : "Add the people who'll work on this task"}
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

          {/* Checklist — seeded from the service template; fully editable here */}
          <Field
            label="Checklist"
            hint={checklist.length ? `${doneCount}/${checklist.length} done` : undefined}
            className="sm:col-span-2"
          >
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
                      <button
                        type="button"
                        onClick={() => removeCheck(i)}
                        className="text-faint opacity-0 hover:text-red-600 group-hover:opacity-100"
                        aria-label="Remove item"
                      >
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
        </div>
        <p className="mt-3 text-xs text-muted">
          Picking a service pre-fills its primary person and checklist above — adjust them before creating.
        </p>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push("/tasks")}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create task"}</Button>
      </div>
    </div>
  );
}
