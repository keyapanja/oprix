"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { setDefaultWorkShift, type ActionState } from "@/lib/org/actions";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

/**
 * The shift that applies to anyone without one of their own.
 *
 * It exists because attendance can't measure lateness without a shift start,
 * and a person with none silently had no lateness at all — which read as a
 * flawless record rather than a missing setting. One default covers everybody
 * nobody got round to assigning.
 *
 * Saves on pick rather than behind a button: it's a single value, and the only
 * thing a Save button would add is a way to forget to press it.
 */
export function DefaultShiftSetting({
  shifts,
  current,
}: {
  shifts: { id: string; name: string; startTime: string; endTime: string; graceMinutes: number }[];
  current: string | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(setDefaultWorkShift, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) router.refresh();
    else if (state.error) toast.error(state.error);
  }, [state, router]);

  if (shifts.length === 0) {
    return (
      <p className="text-sm text-muted">Add a shift above before choosing a default.</p>
    );
  }

  const options = shifts.map((s) => ({
    value: s.id,
    label: `${s.name} · ${s.startTime}–${s.endTime}${s.graceMinutes ? ` · ${s.graceMinutes} min grace` : ""}`,
  }));

  return (
    <form ref={formRef} action={formAction}>
      <Field
        label="Default shift"
        hint="Used for anyone with no shift of their own. Without one, their attendance records hours but can't measure lateness."
      >
        <Combobox
          name="shiftId"
          options={options}
          defaultValue={current ?? ""}
          emptyLabel="— No default —"
          placeholder="— No default —"
          onChange={() => {
            // The hidden input the Combobox writes is updated before this fires.
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
        />
      </Field>
    </form>
  );
}
