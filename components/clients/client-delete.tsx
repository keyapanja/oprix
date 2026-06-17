"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { softDeleteClient } from "@/lib/clients/actions";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";

export function ClientDelete({
  id,
  name,
  projectCount,
}: {
  id: string;
  name: string;
  projectCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function onDelete() {
    const ok = await confirmDialog({
      message:
        projectCount > 0
          ? `Delete "${name}"? Their ${projectCount} project${projectCount === 1 ? "" : "s"} will remain but lose the client link. This can't be undone from the app.`
          : `Delete "${name}"? This can't be undone from the app.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      try {
        const res = await softDeleteClient(id);
        if (res?.error) toast.error(res.error);
        else {
          toast.success("Client deleted");
          router.refresh();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the client.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      className="rounded-md p-1.5 text-faint transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
      aria-label={`Delete ${name}`}
      title="Delete"
    >
      <Icon name="trash" className="size-4" />
    </button>
  );
}
