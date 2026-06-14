"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskMeta, deleteTask } from "@/lib/projects/actions";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { humanizeEnum } from "@/lib/format";

type Svc = { id: string; name: string };
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function TaskEdit({
  taskId,
  projectId,
  services,
  initial,
}: {
  taskId: string;
  projectId: string;
  services: Svc[];
  initial: { name: string; description: string; serviceId: string; priority: string; dueDate: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial.name);
  const [desc, setDesc] = useState(initial.description);
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const [priority, setPriority] = useState(initial.priority);
  const [dueDate, setDueDate] = useState(initial.dueDate);

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", desc);
    fd.set("serviceId", serviceId);
    fd.set("priority", priority);
    fd.set("dueDate", dueDate);
    start(async () => {
      const res = await updateTaskMeta(taskId, fd);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  function onDelete() {
    if (!confirm("Delete this task? This can't be undone.")) return;
    start(async () => {
      const res = await deleteTask(taskId);
      if (res.error) alert(res.error);
      else router.push(`/projects/${projectId}`);
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Icon name="pencil" className="size-4" />
          Edit
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete} disabled={pending}>
          Delete
        </Button>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)} title="Edit task">
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
                {error}
              </div>
            )}
            <Field label="Task name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Service">
                <Combobox
                  value={serviceId}
                  onChange={setServiceId}
                  emptyLabel="— None —"
                  placeholder="— None —"
                  options={services.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
              <Field label="Priority">
                <Combobox value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))} />
              </Field>
              <Field label="Due date">
                <DatePicker value={dueDate} onChange={setDueDate} />
              </Field>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={pending || !name.trim()}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
