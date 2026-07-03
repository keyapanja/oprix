"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLastAppraisal } from "@/lib/employees/actions";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";

/** Inline last-appraisal date. Read-only unless `canEdit` (HR / Super Admin). */
export function AppraisalEdit({
  employeeId,
  initial,
  canEdit,
}: {
  employeeId: string;
  initial: string | null; // YYYY-MM-DD or null
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(initial ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await setLastAppraisal(employeeId, date || null);
      if (res.error) {
        toast.error(res.error);
      } else {
        setEditing(false);
        toast.success("Appraisal date updated");
        router.refresh();
      }
    });
  }

  if (!canEdit) {
    return <span className="text-sm text-content">{initial ? formatDate(initial) : "—"}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDate(initial ?? "");
          setEditing(true);
        }}
        className="group inline-flex items-center gap-1.5 text-sm text-content hover:text-accent-strong"
      >
        {initial ? formatDate(initial) : <span className="text-faint">Set date</span>}
        <Icon name="pencil" className="size-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-40">
        <DatePicker value={date} onChange={setDate} />
      </div>
      <Button size="sm" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </div>
  );
}
