"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePayrollStatutory } from "@/lib/payroll/actions";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        on ? "bg-brand-600" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function StatutorySettings({ pfEnabled, esiEnabled }: { pfEnabled: boolean; esiEnabled: boolean }) {
  const router = useRouter();
  const [pf, setPf] = useState(pfEnabled);
  const [esi, setEsi] = useState(esiEnabled);
  const [pending, start] = useTransition();

  function save(nextPf: boolean, nextEsi: boolean) {
    setPf(nextPf);
    setEsi(nextEsi);
    start(async () => {
      await updatePayrollStatutory(nextPf, nextEsi);
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-sm font-semibold text-content">Statutory deductions</h3>
        <p className="mt-0.5 text-xs text-muted">
          Turn off the ones your company isn&apos;t registered for. With both off and no PT slabs, net pay equals gross (Basic).
          Changes apply the next time you generate (or regenerate) payslips.
        </p>
      </div>
      <div className="divide-y divide-line">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-content">Provident Fund (EPF)</p>
            <p className="mt-0.5 max-w-md text-sm text-muted">
              12% of Basic (capped at ₹15,000 wage). Mandatory once you have 20+ employees.
            </p>
          </div>
          <Toggle on={pf} disabled={pending} onClick={() => save(!pf, esi)} />
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-content">Employees&apos; State Insurance (ESI)</p>
            <p className="mt-0.5 max-w-md text-sm text-muted">
              0.75% of gross, applied only when monthly gross is ₹21,000 or less.
            </p>
          </div>
          <Toggle on={esi} disabled={pending} onClick={() => save(pf, !esi)} />
        </div>
      </div>
    </Card>
  );
}
