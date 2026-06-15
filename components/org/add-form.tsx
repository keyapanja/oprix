"use client";

import { Fragment, useActionState, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/org/actions";

export function AddForm({
  action,
  children,
  submitLabel = "Add",
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Remount the fields on success so both native inputs and Comboboxes reset.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (state.ok) setResetKey((k) => k + 1);
  }, [state]);

  return (
    // Top-aligned so fields with a hint line don't push their input up; the
    // button gets an invisible label spacer so it lines up with the inputs.
    <form action={formAction} className="flex flex-wrap items-start gap-3">
      <Fragment key={resetKey}>{children}</Fragment>
      <div className="space-y-1.5">
        <span aria-hidden="true" className="block select-none text-sm font-medium opacity-0">
          {submitLabel}
        </span>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
