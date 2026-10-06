"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateShift, type ActionState } from "@/lib/org/actions";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";
import { WEEKDAY_NAMES, type WeekdayTimings } from "@/lib/attendance/timings";

export type ShiftRow = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  lunchMinutes: number;
  weekdays: WeekdayTimings;
};

/** Monday first, as the rest of Oprix draws a week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type DayRow = { day: number; start: string; end: string; grace: string; lunch: string };

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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" htmlFor="es-start" required>
          <Input id="es-start" name="startTime" type="time" defaultValue={shift.startTime} required />
        </Field>
        <Field label="End" htmlFor="es-end" required>
          <Input id="es-end" name="endTime" type="time" defaultValue={shift.endTime} required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Grace period (minutes)"
          htmlFor="es-grace"
          hint="Arrivals within this window of the start count as on time. Lateness is measured from the end of it."
        >
          <Input id="es-grace" name="graceMinutes" type="number" min={0} max={180} defaultValue={shift.graceMinutes} />
        </Field>
        <Field
          label="Lunch (minutes)"
          htmlFor="es-lunch"
          hint="Taken off the shift's length for the hours a day asks for on site: 9–6 less 60 is 8h."
        >
          <Input id="es-lunch" name="lunchMinutes" type="number" min={0} max={240} defaultValue={shift.lunchMinutes} />
        </Field>
      </div>
      <WeekdayHours shift={shift} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save shift"}</Button>
      </div>
    </form>
  );
}

/**
 * Weekdays with hours of their own — a short Saturday. Posted with the shift
 * as one JSON field; attendance uses a day's own hours for its lateness, early
 * leaving and the hours it asks for, every week, without anyone re-entering it.
 */
function WeekdayHours({ shift }: { shift: ShiftRow }) {
  const [rows, setRows] = useState<DayRow[]>(() =>
    WEEK_ORDER.flatMap((day) => {
      const t = shift.weekdays[day];
      return t
        ? [{ day, start: t.start, end: t.end, grace: String(t.graceMinutes), lunch: String(t.lunchMinutes) }]
        : [];
    }),
  );
  const free = WEEK_ORDER.filter((d) => !rows.some((r) => r.day === d));
  const json = JSON.stringify(
    Object.fromEntries(
      rows.map((r) => [
        r.day,
        { start: r.start, end: r.end, graceMinutes: Number(r.grace) || 0, lunchMinutes: Number(r.lunch) || 0 },
      ]),
    ),
  );
  const set = (day: number, patch: Partial<DayRow>) =>
    setRows((list) => list.map((r) => (r.day === day ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2.5 rounded-xl bg-canvas p-3.5 ring-1 ring-inset ring-line">
      <input type="hidden" name="weekdayTimings" value={rows.length ? json : ""} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-content">Different hours on some days</p>
          <p className="text-xs text-muted">
            {rows.length ? "These replace the hours above on that weekday, every week." : "Every working day uses the hours above."}
          </p>
        </div>
        {free.length > 0 && (
          <div className="w-44">
            <Combobox
              options={free.map((d) => ({ value: String(d), label: WEEKDAY_NAMES[d] }))}
              value=""
              placeholder="Add a day…"
              searchPlaceholder="Find a day…"
              onChange={(v) => {
                if (!v) return;
                const day = Number(v);
                // Start from the regular hours and lunch; a short day usually
                // changes the end and drops the lunch.
                setRows((list) =>
                  [
                    ...list,
                    {
                      day,
                      start: shift.startTime,
                      end: shift.endTime,
                      grace: String(shift.graceMinutes),
                      lunch: String(shift.lunchMinutes),
                    },
                  ].sort(
                    (a, b) => WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day),
                  ),
                );
              }}
            />
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.day} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface p-2.5 ring-1 ring-inset ring-line">
              <span className="w-24 pb-2.5 text-sm font-medium text-content">{WEEKDAY_NAMES[r.day]}</span>
              <Field label="Start" htmlFor={`wd-${r.day}-start`} className="w-32">
                <Input id={`wd-${r.day}-start`} type="time" value={r.start} onChange={(e) => set(r.day, { start: e.target.value })} required />
              </Field>
              <Field label="End" htmlFor={`wd-${r.day}-end`} className="w-32">
                <Input id={`wd-${r.day}-end`} type="time" value={r.end} onChange={(e) => set(r.day, { end: e.target.value })} required />
              </Field>
              <Field label="Grace" htmlFor={`wd-${r.day}-grace`} className="w-20">
                <Input id={`wd-${r.day}-grace`} type="number" min={0} max={180} value={r.grace} onChange={(e) => set(r.day, { grace: e.target.value })} />
              </Field>
              <Field label="Lunch" htmlFor={`wd-${r.day}-lunch`} className="w-20">
                <Input id={`wd-${r.day}-lunch`} type="number" min={0} max={240} value={r.lunch} onChange={(e) => set(r.day, { lunch: e.target.value })} />
              </Field>
              <button
                type="button"
                onClick={() => setRows((list) => list.filter((x) => x.day !== r.day))}
                className="mb-1 rounded-md p-1.5 text-faint transition-colors hover:bg-canvas hover:text-red-600"
                aria-label={`Use the regular hours on ${WEEKDAY_NAMES[r.day]}`}
                title="Back to the regular hours"
              >
                <Icon name="x" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
        <Modal title={`Edit shift — ${shift.name}`} onClose={() => setOpen(false)} size="lg">
          <ShiftForm shift={shift} onDone={() => { setOpen(false); router.refresh(); }} onCancel={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
