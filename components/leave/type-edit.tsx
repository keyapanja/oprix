"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeaveType, type LeaveState } from "@/lib/leave/actions";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { LeaveAllowanceFields } from "@/components/leave/leave-allowance-fields";

export type LeaveTypeRow = {
  id: string;
  name: string;
  description: string | null;
  paidType: "PAID" | "UNPAID";
  allowanceValue: number;
  allowancePeriod: "YEAR" | "MONTH";
  unlimited: boolean;
};

function TypeForm({ type, onDone, onCancel }: { type: LeaveTypeRow; onDone: () => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<LeaveState, FormData>(updateLeaveType, {});
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
      <input type="hidden" name="id" value={type.id} />
      <Field label="Name" htmlFor="et-name" required>
        <Input id="et-name" name="name" defaultValue={type.name} required />
      </Field>
      <Field label="Description" htmlFor="et-desc">
        <Input id="et-desc" name="description" defaultValue={type.description ?? ""} placeholder="Short note (optional)" />
      </Field>
      <div className="flex flex-wrap gap-4">
        <Field label="Paid?" className="w-32">
          <Combobox name="paidType" defaultValue={type.paidType} options={[{ value: "PAID", label: "Paid" }, { value: "UNPAID", label: "Unpaid" }]} />
        </Field>
        <LeaveAllowanceFields
          defaultUnlimited={type.unlimited}
          defaultDays={type.allowanceValue}
          defaultPeriod={type.allowancePeriod}
          idPrefix="et"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

export function TypeEdit({ type }: { type: LeaveTypeRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-faint transition-colors hover:bg-canvas hover:text-content"
        aria-label={`Edit ${type.name}`}
        title="Edit"
      >
        <Icon name="pencil" className="size-4" />
      </button>
      {open && (
        <Modal title={`Edit ${type.name}`} onClose={() => setOpen(false)}>
          <TypeForm type={type} onDone={() => { setOpen(false); router.refresh(); }} onCancel={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
