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
import { humanizeEnum } from "@/lib/format";

type Svc = { id: string; name: string };
type Proj = { id: string; name: string; services: Svc[] };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"];

export function NewTaskForm({ projects }: { projects: Proj[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [status, setStatus] = useState("TODO");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const serviceOpts = useMemo(() => {
    const p = projects.find((x) => x.id === projectId);
    return (p?.services ?? []).map((s) => ({ value: s.id, label: s.name }));
  }, [projects, projectId]);

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
      });
      if (res.error) setError(res.error);
      else if (res.task) router.push(`/tasks/${res.task.id}`);
    });
  }

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
              onChange={(v) => {
                setProjectId(v);
                setServiceId("");
              }}
              placeholder="Select project"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Service" hint={projectId ? undefined : "Pick a project first"}>
            <Combobox
              value={serviceId}
              onChange={setServiceId}
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
        </div>
        <p className="mt-3 text-xs text-muted">
          Picking a service auto-assigns its primary person and seeds the task checklist.
        </p>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push("/tasks")}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create task"}</Button>
      </div>
    </div>
  );
}
