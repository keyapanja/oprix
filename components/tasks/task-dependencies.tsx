"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TaskStatus } from "@prisma/client";
import { addTaskDependency, removeTaskDependency } from "@/lib/projects/actions";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { TASK_STATUS_TONE, TASK_STATUS_LABEL } from "@/lib/status";

type Blocker = { id: string; name: string; status: TaskStatus };
type Opt = { id: string; name: string };

export function TaskDependencies({
  taskId,
  blockers,
  options,
  canEdit,
}: {
  taskId: string;
  blockers: Blocker[];
  options: Opt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");

  function add() {
    if (!pick) return;
    start(async () => {
      const r = await addTaskDependency(taskId, pick);
      if (r.error) toast.error(r.error);
      else {
        setPick("");
        router.refresh();
      }
    });
  }
  function remove(id: string) {
    start(async () => {
      const r = await removeTaskDependency(taskId, id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  const blockerIds = new Set(blockers.map((b) => b.id));
  const avail = options.filter((o) => !blockerIds.has(o.id));

  return (
    <div className="space-y-3">
      {blockers.length === 0 ? (
        <p className="text-sm text-muted">No blockers — this task isn&apos;t waiting on anything.</p>
      ) : (
        <ul className="space-y-2">
          {blockers.map((b) => (
            <li key={b.id} className="flex items-center gap-2">
              <Icon name="check" className="size-3.5 shrink-0 text-faint" />
              <Link href={`/tasks/${b.id}`} className="min-w-0 flex-1 truncate text-sm text-content hover:text-accent-strong hover:underline">{b.name}</Link>
              <Badge tone={TASK_STATUS_TONE[b.status]}>{TASK_STATUS_LABEL[b.status]}</Badge>
              {canEdit && (
                <button onClick={() => remove(b.id)} disabled={pending} className="rounded p-1 text-faint transition-colors hover:text-red-600" aria-label="Remove dependency">
                  <Icon name="x" className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && avail.length > 0 && (
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <div className="min-w-0 flex-1">
            <Combobox value={pick} onChange={setPick} options={avail.map((o) => ({ value: o.id, label: o.name }))} placeholder="Add a blocking task…" />
          </div>
          <Button size="sm" onClick={add} disabled={pending || !pick}>Add</Button>
        </div>
      )}
    </div>
  );
}
