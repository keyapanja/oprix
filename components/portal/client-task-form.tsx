"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clientCreateTask } from "@/lib/portal/actions";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
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
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fixed = !!fixedProjectId;
  const sel = projects.find((p) => p.id === selId) ?? null;
  const bmName = sel?.bmName ?? null;

  function reset() {
    setName("");
    setDescription("");
    setPriority("MEDIUM");
    setDueDate("");
    setError(null);
  }

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
      toast.success("Task sent to your Business Manager");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    // On a project page with no BM, explain instead of offering the button.
    if (fixed && !bmName) {
      return (
        <Card className="p-4 text-sm text-muted">
          A Business Manager hasn&apos;t been assigned to this project yet, so you can&apos;t raise a task here. Your team will set one up.
        </Card>
      );
    }
    return (
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" className="size-4" /> Raise a task
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content">Raise a task</h3>
        <button type="button" onClick={() => { reset(); setOpen(false); }} className="text-faint hover:text-content" aria-label="Close">
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
        <Button variant="secondary" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
        <Button onClick={submit} disabled={pending || !name.trim() || !bmName || !selId}>{pending ? "Sending…" : "Send task"}</Button>
      </div>
    </Card>
  );
}
