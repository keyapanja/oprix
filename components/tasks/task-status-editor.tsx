"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { setTaskStatus } from "@/lib/projects/actions";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "@/components/ui/toast";
import { TASK_STATUS_LABEL } from "@/lib/status";

// Statuses a user can set by hand; review/completed stay workflow-driven.
const MANUAL: TaskStatus[] = ["TODO", "IN_PROGRESS", "HOLD"];

/** Inline status picker for the task header — gated to the assigner/assignee. */
export function TaskStatusEditor({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const router = useRouter();
  const [value, setValue] = useState<string>(status);
  const [, start] = useTransition();

  // If the task is in a workflow state, show it as the current value but only
  // offer the manual statuses to switch to.
  const statuses = MANUAL.includes(status) ? MANUAL : [status, ...MANUAL];
  const options = statuses.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }));

  function onChange(next: string) {
    if (next === value) return;
    const prev = value;
    setValue(next);
    start(async () => {
      const res = await setTaskStatus(taskId, next as TaskStatus);
      if (res.error) {
        setValue(prev);
        toast.error(res.error);
      } else {
        toast.success("Status updated");
        router.refresh();
      }
    });
  }

  return (
    <div className="w-44">
      <Combobox value={value} onChange={onChange} options={options} />
    </div>
  );
}
