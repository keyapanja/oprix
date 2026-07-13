"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskClientVisible } from "@/lib/projects/actions";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";

/** Manager control: show/hide this task in the client portal (client project only). */
export function TaskClientVisible({ taskId, clientVisible }: { taskId: string; clientVisible: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(clientVisible);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    const prev = on;
    setOn(next);
    start(async () => {
      const res = await setTaskClientVisible(taskId, next);
      if (res.error) {
        setOn(prev);
        toast.error(res.error);
      } else {
        toast.success(next ? "Shared with the client" : "Hidden from the client");
        router.refresh();
      }
    });
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-content ring-1 ring-inset ring-line hover:bg-canvas">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => toggle(e.target.checked)}
        className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
      />
      <Icon name="eye" className="size-4 text-faint" />
      Visible to client
    </label>
  );
}
