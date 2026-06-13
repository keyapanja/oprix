"use client";

import { useActionState, useEffect, useRef } from "react";
import { addEmergencyContact, type EmployeeFormState } from "@/lib/employees/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function EmergencyContactForm({ employeeId }: { employeeId: string }) {
  const [state, formAction, pending] = useActionState<EmployeeFormState, FormData>(
    addEmergencyContact,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="min-w-40 flex-1">
        <label className="mb-1 block text-xs font-medium text-muted">Name</label>
        <Input name="name" placeholder="Contact name" required />
      </div>
      <div className="min-w-32 flex-1">
        <label className="mb-1 block text-xs font-medium text-muted">Relationship</label>
        <Input name="relationship" placeholder="e.g. Spouse" />
      </div>
      <div className="min-w-32 flex-1">
        <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
        <Input name="phone" placeholder="+91 …" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
