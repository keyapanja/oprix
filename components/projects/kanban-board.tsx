"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask, type KanbanTask } from "@/lib/projects/actions";
import { PRIORITY_TONE, TASK_STATUS_TONE } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { humanizeEnum } from "@/lib/format";

type Service = { id: string; name: string };

function Avatars({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex -space-x-1.5">
      {names.slice(0, 3).map((n, i) => (
        <span
          key={i}
          title={n}
          className="gradient-brand flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-surface"
        >
          {n.slice(0, 2).toUpperCase()}
        </span>
      ))}
      {names.length > 3 && (
        <span className="flex size-6 items-center justify-center rounded-full bg-canvas text-[10px] font-semibold text-muted ring-2 ring-surface">
          +{names.length - 3}
        </span>
      )}
    </div>
  );
}

/**
 * Project task list. Status is driven by the per-task timer + the review
 * workflow (submit → review → approve), so there's no drag-to-change board —
 * just a simple list with a quick "add task" (new tasks start in To Do).
 */
export function KanbanBoard({
  projectId,
  services,
  initialTasks,
}: {
  projectId: string;
  services: Service[];
  initialTasks: KanbanTask[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<KanbanTask[]>(initialTasks);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{tasks.length} task{tasks.length === 1 ? "" : "s"}</p>
        <button
          onClick={() => setAdding((a) => !a)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-3 py-1.5 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface"
        >
          <Icon name="plus" className="size-4" />
          Add task
        </button>
      </div>

      {adding && (
        <AddTaskForm
          projectId={projectId}
          services={services}
          onAdded={(task) => {
            setTasks((ts) => [...ts, task]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <TaskList tasks={tasks} onOpen={(id) => router.push(`/tasks/${id}`)} />
    </div>
  );
}

function TaskList({ tasks, onOpen }: { tasks: KanbanTask[]; onOpen: (id: string) => void }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-5 py-12 text-center text-sm text-muted">
        No tasks yet — add one above.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
            <th className="px-5 py-3">Task</th>
            <th className="px-5 py-3">Service</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Priority</th>
            <th className="px-5 py-3">Assignees</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {tasks.map((t) => (
            <tr key={t.id} className="cursor-pointer hover:bg-canvas" onClick={() => onOpen(t.id)}>
              <td className="px-5 py-3 font-medium text-content">{t.name}</td>
              <td className="px-5 py-3 text-muted">{t.serviceName ?? "—"}</td>
              <td className="px-5 py-3"><Badge tone={TASK_STATUS_TONE[t.status]}>{humanizeEnum(t.status)}</Badge></td>
              <td className="px-5 py-3"><Badge tone={PRIORITY_TONE[t.priority]}>{humanizeEnum(t.priority)}</Badge></td>
              <td className="px-5 py-3"><Avatars names={t.assigneeNames} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddTaskForm({
  projectId,
  services,
  onAdded,
  onCancel,
}: {
  projectId: string;
  services: Service[];
  onAdded: (task: KanbanTask) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    start(async () => {
      const res = await createTask({ projectId, name: trimmed, serviceId: serviceId || null, status: "TODO" });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.task) onAdded(res.task);
    });
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Task name…"
        className="h-9 min-w-48 flex-1 rounded-lg bg-canvas px-3 text-sm text-content placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {services.length > 0 && (
        <div className="w-56">
          <Combobox
            value={serviceId}
            onChange={setServiceId}
            emptyLabel="No sub-category"
            placeholder="No sub-category"
            options={services.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
      )}
      <button
        onClick={submit}
        disabled={pending}
        className="gradient-brand-strong rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add task"}
      </button>
      <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas">
        Cancel
      </button>
    </div>
  );
}
