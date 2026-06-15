"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskMilestone } from "@/lib/projects/actions";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "@/components/ui/toast";

type Opt = { id: string; name: string };

export function TaskMilestone({
  taskId,
  current,
  options,
  canEdit,
}: {
  taskId: string;
  current: string | null;
  options: Opt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!canEdit) {
    const name = options.find((o) => o.id === current)?.name;
    return <p className="text-sm text-content">{name ?? <span className="text-faint">None</span>}</p>;
  }

  function change(v: string) {
    start(async () => {
      const r = await setTaskMilestone(taskId, v || null);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className={pending ? "opacity-70" : ""}>
      <Combobox
        value={current ?? ""}
        onChange={change}
        options={options.map((o) => ({ value: o.id, label: o.name }))}
        placeholder="No milestone"
        emptyLabel="— None —"
      />
    </div>
  );
}
