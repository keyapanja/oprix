"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adjustPayslip, type ActionState } from "@/lib/payroll/actions";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PayslipAdjust({
  payslipId,
  initialBonus,
  initialBonusLabel,
  initialOther,
  initialOtherLabel,
}: {
  payslipId: string;
  initialBonus: number; // rupees
  initialBonusLabel: string;
  initialOther: number; // rupees
  initialOtherLabel: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adjustPayslip, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <Card className="p-5 no-print">
      <h3 className="text-sm font-semibold text-content">Adjustments for this run</h3>
      <p className="mt-0.5 mb-4 text-xs text-muted">
        One-off bonus / deduction for this month only. Statutory amounts recompute automatically.
      </p>
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
            {state.error}
          </div>
        )}
        {state.ok && (
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25">
            Adjustments saved.
          </div>
        )}
        <input type="hidden" name="payslipId" value={payslipId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bonus / incentive (₹)" htmlFor="adj-bonus">
            <Input id="adj-bonus" name="bonus" type="number" min="0" step="0.01" defaultValue={initialBonus || ""} placeholder="0" />
          </Field>
          <Field label="Bonus label" htmlFor="adj-bonus-label">
            <Input id="adj-bonus-label" name="bonusLabel" defaultValue={initialBonusLabel} placeholder="Bonus" maxLength={40} />
          </Field>
          <Field label="Other deduction (₹)" htmlFor="adj-other">
            <Input id="adj-other" name="other" type="number" min="0" step="0.01" defaultValue={initialOther || ""} placeholder="0" />
          </Field>
          <Field label="Deduction label" htmlFor="adj-other-label">
            <Input id="adj-other-label" name="otherLabel" defaultValue={initialOtherLabel} placeholder="Advance recovery" maxLength={40} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save adjustments"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
