"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPayrollRun, type ActionState } from "@/lib/payroll/actions";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { monthName } from "@/lib/format";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }));

export function CreateRunForm({ defaultYear, defaultMonth }: { defaultYear: number; defaultMonth: number }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPayrollRun, {});
  const [month, setMonth] = useState(String(defaultMonth));
  const [year, setYear] = useState(String(defaultYear));

  useEffect(() => {
    if (state.ok && state.runId) router.push(`/payroll/${state.runId}`);
  }, [state, router]);

  const years = [defaultYear + 1, defaultYear, defaultYear - 1, defaultYear - 2].map((y) => ({
    value: String(y),
    label: String(y),
  }));

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-content">Start a payroll run</h3>
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
            {state.error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Month">
            <Combobox name="periodMonth" value={month} onChange={setMonth} options={MONTHS} />
          </Field>
          <Field label="Year">
            <Combobox name="periodYear" value={year} onChange={setYear} options={years} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Creating…" : "Create run"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
