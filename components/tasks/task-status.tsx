"use client";

import { useState, useTransition } from "react";
import type { TaskStatus } from "@prisma/client";
import { updateTaskStatus } from "@/lib/projects/actions";
import { Combobox } from "@/components/ui/combobox";
import { humanizeEnum } from "@/lib/format";

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"];

export function TaskStatusControl({ id, status: initial }: { id: string; status: TaskStatus }) {
  const [status, setStatus] = useState<TaskStatus>(initial);
  const [pending, start] = useTransition();
  return (
    <div className="w-44">
      <Combobox
        value={status}
        disabled={pending}
        onChange={(v) => {
          const next = v as TaskStatus;
          setStatus(next);
          start(async () => {
            const res = await updateTaskStatus(id, next);
            if (res.error) alert(res.error);
          });
        }}
        options={STATUSES.map((s) => ({ value: s, label: humanizeEnum(s) }))}
      />
    </div>
  );
}
