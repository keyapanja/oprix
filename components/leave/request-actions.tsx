"use client";

import { useTransition } from "react";
import type { ApprovalStatus } from "@prisma/client";
import { approveLeave, rejectLeave } from "@/lib/leave/actions";
import { Button } from "@/components/ui/button";

export function RequestActions({
  id,
  status,
}: {
  id: string;
  status: ApprovalStatus;
}) {
  const [pending, start] = useTransition();

  if (status === "HR_APPROVED" || status === "REJECTED" || status === "APPROVED") {
    return null;
  }

  const approveLabel = status === "PENDING" ? "Approve (Manager)" : "Approve (HR)";

  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await approveLeave(id);
            if (res.error) alert(res.error);
          })
        }
      >
        {approveLabel}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (!confirm("Reject this leave request?")) return;
            const res = await rejectLeave(id);
            if (res.error) alert(res.error);
          })
        }
      >
        Reject
      </Button>
    </div>
  );
}
