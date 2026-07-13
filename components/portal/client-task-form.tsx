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

/**
 * A simplified task-request form for the client: the project and the assignee
 * (their Business Manager) are fixed and read-only; the client just adds a
 * title, details, priority, and an optional due date.
 */
export function ClientTaskForm({
  projectId,
  projectName,
  bmName,
}: {
  projectId: string;
  projectName: string;
  bmName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!bmName) {
    return (
      <Card className="p-4 text-sm text-muted">
        A Business Manager hasn&apos;t been assigned to this project yet, so you can&apos;t raise a task here. Your team will set one up.
      </Card>
    );
  }

  function reset() {
    setName("");
    setDescription("");
    setPriority("MEDIUM");
    setDueDate("");
    setError(null);
  }

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the task a name.");
    start(async () => {
      const res = await clientCreateTask({
        projectId,
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
        <Field label="Project">
          <div className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted ring-1 ring-inset ring-line">{projectName}</div>
        </Field>
        <Field label="Assigned to">
          <div className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted ring-1 ring-inset ring-line">{bmName}</div>
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

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
        <Button onClick={submit} disabled={pending || !name.trim()}>{pending ? "Sending…" : "Send task"}</Button>
      </div>
    </Card>
  );
}
