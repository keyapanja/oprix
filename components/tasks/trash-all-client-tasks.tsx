"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { trashAllClientTasks } from "@/lib/projects/actions";

/** Admins: move every client-raised task to Trash, all clients at once. */
export function TrashAllClientTasks({ total, cutoffISO }: { total: number; cutoffISO: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    void (async () => {
      const ok = await confirmDialog({
        title: `Move all ${total} client tasks to Trash?`,
        message:
          `Every task raised by a client, across all clients, goes to Trash — ${total} in all. ` +
          "Your team's own tasks aren't touched. Anything can be restored from Trash until it's emptied.",
        tone: "danger",
        confirmLabel: `Move ${total} to Trash`,
      });
      if (!ok) return;
      start(async () => {
        const res = await trashAllClientTasks(cutoffISO);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success(
          `Moved ${res.deleted} task${res.deleted === 1 ? "" : "s"} to Trash${res.skipped ? ` (${res.skipped} couldn't be moved)` : ""}`,
        );
        router.refresh();
      });
    })();
  }

  return (
    <Button variant="secondary" onClick={run} disabled={pending || total === 0}>
      <Icon name="trash" className="size-4" />
      {pending ? "Moving to Trash…" : "Move all to Trash"}
    </Button>
  );
}
