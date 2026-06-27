"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateTask } from "@/lib/projects/actions";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";

/** "Duplicate" button for the task detail header — clones the task and opens the copy. */
export function TaskDuplicate({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const res = await duplicateTask(taskId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Task duplicated");
      if (res.task) router.push(`/tasks/${res.task.id}`);
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-3 py-1.5 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface disabled:opacity-50"
    >
      <Icon name="copy" className="size-4" />
      {pending ? "Duplicating…" : "Duplicate"}
    </button>
  );
}
