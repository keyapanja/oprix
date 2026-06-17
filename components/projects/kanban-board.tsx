"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KanbanTask } from "@/lib/projects/actions";
import { PRIORITY_TONE, TASK_STATUS_TONE } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { humanizeEnum } from "@/lib/format";

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
 * just a simple list. "Add task" opens the full new-task form with this
 * project pre-selected.
 */
export function KanbanBoard({
  projectId,
  initialTasks,
}: {
  projectId: string;
  initialTasks: KanbanTask[];
}) {
  const router = useRouter();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {initialTasks.length} task{initialTasks.length === 1 ? "" : "s"}
        </p>
        <Link
          href={`/tasks/new?project=${projectId}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-3 py-1.5 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface"
        >
          <Icon name="plus" className="size-4" />
          Add task
        </Link>
      </div>

      <TaskList tasks={initialTasks} onOpen={(id) => router.push(`/tasks/${id}`)} />
    </div>
  );
}

function TaskList({ tasks, onOpen }: { tasks: KanbanTask[]; onOpen: (id: string) => void }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-5 py-12 text-center text-sm text-muted">
        No tasks yet — use “Add task” to create one.
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
