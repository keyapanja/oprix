"use client";

import { useActionState, useEffect, useRef } from "react";
import { createLeaveRequest, type LeaveState } from "@/lib/leave/actions";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";

type Opt = { id: string; name: string };

export function RequestForm({
  employees,
  leaveTypes,
}: {
  employees: Opt[];
  leaveTypes: Opt[];
}) {
  const [state, formAction, pending] = useActionState<LeaveState, FormData>(
    createLeaveRequest,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  const ready = employees.length > 0 && leaveTypes.length > 0;

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}
      {!ready && (
        <p className="text-sm text-muted">
          Add at least one employee and one leave type before raising a request.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee" required>
          <Combobox
            name="employeeId"
            placeholder="Select employee"
            disabled={!ready}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
          />
        </Field>
        <Field label="Leave type" required>
          <Combobox
            name="leaveTypeId"
            placeholder="Select type"
            disabled={!ready}
            options={leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        <Field label="Start date" htmlFor="lr-start" required>
          <Input id="lr-start" name="startDate" type="date" required disabled={!ready} />
        </Field>
        <Field label="End date" htmlFor="lr-end" required>
          <Input id="lr-end" name="endDate" type="date" required disabled={!ready} />
        </Field>
      </div>
      <Field label="Reason" htmlFor="lr-reason">
        <Textarea id="lr-reason" name="reason" placeholder="Optional note…" disabled={!ready} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
