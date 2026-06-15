"use client";

import { useActionState, useEffect, useState } from "react";
import { saveSalaryStructure, type ActionState } from "@/lib/payroll/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { todayISO } from "@/lib/dates";

export type SalaryInitial = { basic: number; hra: number; special: number; effectiveFrom: string };

export function SalaryForm({
  employeeId,
  initial,
  onDone,
  onCancel,
}: {
  employeeId: string;
  initial: SalaryInitial | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveSalaryStructure, {});
  const [eff, setEff] = useState(initial?.effectiveFrom ?? todayISO());

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Basic (₹ / month)" required htmlFor="sal-basic">
          <Input id="sal-basic" name="basic" type="number" min="0" step="0.01" defaultValue={initial?.basic ?? ""} placeholder="e.g. 30000" />
        </Field>
        <Field label="HRA (₹ / month)" htmlFor="sal-hra">
          <Input id="sal-hra" name="hra" type="number" min="0" step="0.01" defaultValue={initial?.hra ?? ""} placeholder="0" />
        </Field>
        <Field label="Special allowance (₹ / month)" htmlFor="sal-special">
          <Input id="sal-special" name="specialAllowance" type="number" min="0" step="0.01" defaultValue={initial?.special ?? ""} placeholder="0" />
        </Field>
        <Field label="Effective from" required>
          <DatePicker name="effectiveFrom" value={eff} onChange={setEff} />
        </Field>
      </div>
      <p className="text-xs text-muted">
        PF, ESI and Professional Tax are calculated automatically when payroll runs.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save salary"}
        </Button>
      </div>
    </form>
  );
}
