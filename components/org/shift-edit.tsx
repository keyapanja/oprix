"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateShift, type ActionState } from "@/lib/org/actions";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export type ShiftRow = { id: string; name: string; startTime: string; endTime: string; graceMinutes: number };

function ShiftForm({ shift, onDone, onCancel }: { shift: ShiftRow; onDone: () => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateShift, {});
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
      <input type="hidden" name="id" value={shift.id} />
      <Field label="Shift name" htmlFor="es-name" required>
        <Input id="es-name" name="name" defaultValue={shift.name} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Start" htmlFor="es-start" required>
          <Input id="es-start" name="startTime" type="time" defaultValue={shift.startTime} required />
        </Field>
        <Field label="End" htmlFor="es-end" required>
          <Input id="es-end" name="endTime" type="time" defaultValue={shift.endTime} required />
        </Field>
        <Field label="Grace (min)" htmlFor="es-grace">
          <Input id="es-grace" name="graceMinutes" type="number" min={0} max={180} defaultValue={shift.graceMinutes} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save shift"}</Button>
      </div>
    </form>
  );
}

export function ShiftEdit({ shift }: { shift: ShiftRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-faint transition-colors hover:bg-canvas hover:text-content"
        aria-label={`Edit ${shift.name}`}
        title="Edit"
      >
        <Icon name="pencil" className="size-4" />
      </button>
      {open && (
        <Modal title={`Edit shift — ${shift.name}`} onClose={() => setOpen(false)}>
          <ShiftForm shift={shift} onDone={() => { setOpen(false); router.refresh(); }} onCancel={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
