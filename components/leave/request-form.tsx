"use client";

import { Fragment, useActionState, useEffect, useState } from "react";
import { createLeaveRequest, type LeaveState } from "@/lib/leave/actions";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";

type Opt = { id: string; name: string };

export function RequestForm({
  employees,
  leaveTypes,
  onSuccess,
}: {
  employees: Opt[];
  leaveTypes: Opt[];
  /** Called after a request is created (e.g. to close a modal + refresh). */
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState<LeaveState, FormData>(
    createLeaveRequest,
    {},
  );
  // Remount fields on success so Comboboxes/DatePickers reset too.
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    if (state.ok) {
      setResetKey((k) => k + 1);
      toast.success("Leave request added");
      onSuccess?.();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = employees.length > 0 && leaveTypes.length > 0;

  return (
    <form action={formAction} className="space-y-4">
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

      <Fragment key={resetKey}>
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
          <Field label="Start date" required>
            <DatePicker name="startDate" disabled={!ready} />
          </Field>
          <Field label="End date" required>
            <DatePicker name="endDate" disabled={!ready} />
          </Field>
          <Field label="Duration">
            <Combobox
              name="isHalfDay"
              defaultValue="false"
              disabled={!ready}
              options={[
                { value: "false", label: "Full day" },
                { value: "true", label: "Half day" },
              ]}
            />
          </Field>
        </div>
        <Field label="Reason" htmlFor="lr-reason">
          <Textarea id="lr-reason" name="reason" placeholder="Optional note…" disabled={!ready} />
        </Field>
      </Fragment>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
