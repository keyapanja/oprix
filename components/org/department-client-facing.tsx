"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDepartmentClientFacing } from "@/lib/org/actions";
import { toast } from "@/components/ui/toast";

/**
 * Per-department toggle: is this a client-facing department? Its members become
 * the "Business Managers" a client talks to in the portal (the client's contact
 * = the client-facing category's primary assignee on their project).
 */
export function DepartmentClientFacing({
  departmentId,
  clientFacing,
}: {
  departmentId: string;
  clientFacing: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(clientFacing);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    const prev = on;
    setOn(next);
    start(async () => {
      const res = await setDepartmentClientFacing(departmentId, next);
      if (res.error) {
        setOn(prev);
        toast.error(res.error);
      } else {
        toast.success(next ? "Marked client-facing" : "No longer client-facing");
        router.refresh();
      }
    });
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-content">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => toggle(e.target.checked)}
        className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
      />
      <span className="text-muted">Client-facing</span>
    </label>
  );
}
