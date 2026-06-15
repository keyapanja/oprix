"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  processPayrollRun,
  lockPayrollRun,
  unlockPayrollRun,
  markPayrollRunPaid,
  deletePayrollRun,
  type ActionState,
} from "@/lib/payroll/actions";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";

export function RunControls({
  runId,
  status,
  payslipCount,
}: {
  runId: string;
  status: "DRAFT" | "LOCKED" | "PAID";
  payslipCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function run(
    fn: () => Promise<ActionState>,
    opts?: { confirm?: string; confirmLabel?: string; tone?: "danger" | "default"; redirectTo?: string },
  ) {
    if (opts?.confirm) {
      const ok = await confirmDialog({ message: opts.confirm, tone: opts.tone, confirmLabel: opts.confirmLabel });
      if (!ok) return;
    }
    start(async () => {
      const res = await fn();
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      // The run page is gone after delete — go to the list, don't refresh into a 404.
      if (opts?.redirectTo) {
        router.push(opts.redirectTo);
        return;
      }
      if (res?.message) toast.success(res.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && (
        <>
          <Button size="sm" disabled={pending} onClick={() => run(() => processPayrollRun(runId))}>
            Generate payslips
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || payslipCount === 0}
            onClick={() => run(() => lockPayrollRun(runId), { confirm: "Lock this run? Payslips become final and employees can be paid.", confirmLabel: "Lock run" })}
          >
            Lock run
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => run(() => deletePayrollRun(runId), { confirm: "Delete this draft run and all its payslips?", tone: "danger", redirectTo: "/payroll" })}
          >
            Delete
          </Button>
        </>
      )}
      {status === "LOCKED" && (
        <>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => markPayrollRunPaid(runId), { confirm: "Mark this run as paid and notify employees their payslips are ready?", confirmLabel: "Mark as paid" })}
          >
            Mark as paid
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => unlockPayrollRun(runId))}>
            Unlock
          </Button>
        </>
      )}
      {status === "PAID" && <p className="text-sm text-muted">This run is paid and final.</p>}
    </div>
  );
}
