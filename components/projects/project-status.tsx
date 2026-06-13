"use client";

import { useState, useTransition } from "react";
import type { ProjectStatus } from "@prisma/client";
import { updateProjectStatus } from "@/lib/projects/actions";
import { Combobox } from "@/components/ui/combobox";
import { humanizeEnum } from "@/lib/format";

const STATUSES: ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];

export function ProjectStatusControl({
  id,
  status: initial,
}: {
  id: string;
  status: ProjectStatus;
}) {
  const [status, setStatus] = useState<ProjectStatus>(initial);
  const [pending, start] = useTransition();

  return (
    <div className="w-44">
      <Combobox
        value={status}
        disabled={pending}
        onChange={(v) => {
          const next = v as ProjectStatus;
          setStatus(next);
          start(async () => {
            const res = await updateProjectStatus(id, next);
            if (res.error) alert(res.error);
          });
        }}
        options={STATUSES.map((s) => ({ value: s, label: humanizeEnum(s) }))}
      />
    </div>
  );
}
