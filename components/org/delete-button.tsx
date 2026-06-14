"use client";

import { useTransition } from "react";
import { deleteOrgEntity } from "@/lib/org/actions";
import { Icon } from "@/components/ui/icons";

type Entity =
  | "department"
  | "service"
  | "designation"
  | "shift"
  | "location"
  | "probationPeriod";

export function DeleteButton({
  entity,
  id,
  label,
}: {
  entity: Entity;
  id: string;
  label: string;
}) {
  const [pending, start] = useTransition();

  function onDelete() {
    if (!confirm(`Delete "${label}"? This can't be undone.`)) return;
    start(async () => {
      const res = await deleteOrgEntity(entity, id);
      if (res.error) alert(res.error);
    });
  }

  return (
    <button
      onClick={onDelete}
      disabled={pending}
      className="rounded-md p-1.5 text-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/15"
      title="Delete"
      aria-label={`Delete ${label}`}
    >
      <Icon name="trash" className="size-4" />
    </button>
  );
}
