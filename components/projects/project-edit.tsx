"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProject, softDeleteProject } from "@/lib/projects/actions";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { humanizeEnum } from "@/lib/format";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const TYPES = [
  { value: "ONE_TIME", label: "One time" },
  { value: "RECURRING", label: "Recurring" },
];

export function ProjectEdit({
  projectId,
  initial,
}: {
  projectId: string;
  initial: { name: string; description: string; priority: string; type: string; startDate: string; dueDate: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial.name);
  const [desc, setDesc] = useState(initial.description);
  const [priority, setPriority] = useState(initial.priority);
  const [type, setType] = useState(initial.type);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", desc);
    fd.set("priority", priority);
    fd.set("type", type);
    fd.set("startDate", startDate);
    fd.set("dueDate", dueDate);
    start(async () => {
      const res = await updateProject(projectId, fd);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  async function onDelete() {
    const ok = await confirmDialog({
      message: "Delete this project? It will be moved to trash.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      const res = await softDeleteProject(projectId);
      if (res.error) toast.error(res.error);
      else router.push("/projects");
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Icon name="pencil" className="size-4" />
        Edit
      </Button>

      {open && (
        <Modal onClose={() => setOpen(false)} title="Edit project">
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
                {error}
              </div>
            )}
            <Field label="Project name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Priority">
                <Combobox value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))} />
              </Field>
              <Field label="Type">
                <Combobox value={type} onChange={setType} options={TYPES} />
              </Field>
              <Field label="Start date">
                <DatePicker value={startDate} onChange={setStartDate} />
              </Field>
              <Field label="Due date">
                <DatePicker value={dueDate} onChange={setDueDate} />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <Button variant="danger" onClick={onDelete} disabled={pending}>Delete project</Button>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={pending || !name.trim()}>{pending ? "Saving…" : "Save"}</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
