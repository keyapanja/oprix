"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { createTask, updateTaskStatus, type KanbanTask } from "@/lib/projects/actions";
import { TASK_COLUMNS, PRIORITY_TONE, TASK_STATUS_TONE } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/cn";

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
  const [view, setView] = useState<"board" | "list">("board");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [, startTransition] = useTransition();

  function moveTask(id: string, status: TaskStatus) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    const prev = task.status;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    startTransition(async () => {
      const res = await updateTaskStatus(id, status);
      if (res.error) {
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: prev } : t)));
        alert(res.error);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{tasks.length} tasks</p>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {(["board", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium capitalize",
                view === v ? "bg-accent-soft text-accent-strong" : "text-muted hover:text-content",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TASK_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverCol(col.status);
                }}
                onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
                onDrop={() => {
                  if (dragId) moveTask(dragId, col.status);
                  setDragId(null);
                  setOverCol(null);
                }}
                className={cn(
                  "flex flex-col rounded-2xl border p-3 transition-colors",
                  overCol === col.status ? "border-brand-400 bg-accent-soft" : "border-line bg-canvas/50",
                )}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold text-content">{col.label}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-line">
                    {colTasks.length}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => router.push(`/tasks/${t.id}`)}
                      className={cn(
                        "cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-card hover:border-brand-400",
                        dragId === t.id && "opacity-50",
                      )}
                    >
                      <p className="text-sm font-medium text-content">{t.name}</p>
                      {t.serviceName && (
                        <span className="mt-1.5 inline-block rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-strong">
                          {t.serviceName}
                        </span>
                      )}
                      <div className="mt-2.5 flex items-center justify-between">
                        <Badge tone={PRIORITY_TONE[t.priority]}>{humanizeEnum(t.priority)}</Badge>
                        <Avatars names={t.assigneeNames} />
                      </div>
                    </div>
                  ))}
                </div>

                <ColumnAdd
                  projectId={projectId}
                  status={col.status}
                  services={services}
                  onAdded={(task) => setTasks((ts) => [...ts, task])}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <TaskList tasks={tasks} onOpen={(id) => router.push(`/tasks/${id}`)} />
      )}
    </div>
  );
}

function TaskList({ tasks, onOpen }: { tasks: KanbanTask[]; onOpen: (id: string) => void }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-5 py-12 text-center text-sm text-muted">
        No tasks yet. Switch to Board view to add some.
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

function ColumnAdd({
  projectId,
  status,
  services,
  onAdded,
}: {
  projectId: string;
  status: TaskStatus;
  services: Service[];
  onAdded: (task: KanbanTask) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    start(async () => {
      const res = await createTask({ projectId, name: trimmed, serviceId: serviceId || null, status });
      if (res.error) {
        alert(res.error);
        return;
      }
      if (res.task) onAdded(res.task);
      setName("");
      setServiceId("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface hover:text-content"
      >
        <Icon name="plus" className="size-4" />
        Add task
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-2.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Task name…"
        className="w-full rounded-lg bg-canvas px-2.5 py-1.5 text-sm text-content placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {services.length > 0 && (
        <Combobox
          value={serviceId}
          onChange={setServiceId}
          emptyLabel="No service"
          placeholder="No service"
          options={services.map((s) => ({ value: s.id, label: s.name }))}
        />
      )}
      <div className="flex gap-2">
        <button onClick={submit} disabled={pending} className="gradient-brand-strong flex-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "Adding…" : "Add"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas">
          Cancel
        </button>
      </div>
    </div>
  );
}
