"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
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
            if (res.error) toast.error(res.error);
          })
        }
      >
        {approveLabel}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          if (!(await confirmDialog({ message: "Reject this leave request?", tone: "danger", confirmLabel: "Reject" }))) return;
          start(async () => {
            const res = await rejectLeave(id);
            if (res.error) toast.error(res.error);
          });
        }}
      >
        Reject
      </Button>
    </div>
  );
}
