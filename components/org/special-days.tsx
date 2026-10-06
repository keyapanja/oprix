"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { AddForm } from "@/components/org/add-form";
import { createSpecialDay, deleteSpecialDay } from "@/lib/org/actions";
import { formatISO } from "@/lib/dates";

export type SpecialDayRow = {
  id: string;
  from: string;
  to: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  lunchMinutes: number;
  workingDay: boolean;
  note: string | null;
  shiftIds: string[];
};

type ShiftOption = { id: string; name: string; graceMinutes: number; lunchMinutes: number };

/**
 * Dated changes to shifts' hours — opening late after a festival, closing early
 * before one, a Sunday worked. Attendance applies them whenever it's read, so
 * each one corrects every report covering its dates, past ones included.
 */
export function SpecialDays({ shifts, days }: { shifts: ShiftOption[]; days: SpecialDayRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const shiftName = new Map(shifts.map((s) => [s.id, s.name]));

  function covers(d: SpecialDayRow): string {
    const names = d.shiftIds.flatMap((id) => {
      const n = shiftName.get(id);
      return n ? [n] : [];
    });
    if (names.length === 0) return "No shifts left — they were deleted";
    if (shifts.length > 1 && names.length === shifts.length) return "All shifts";
    return names.join(", ");
  }

  async function remove(d: SpecialDayRow) {
    const ok = await confirmDialog({
      title: "Delete this special day?",
      message: "Attendance for these dates goes back to the shifts' usual hours.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteSpecialDay(d.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Special day deleted");
      router.refresh();
    });
  }

  if (shifts.length === 0) {
    return <p className="text-sm text-muted">Add a shift above before setting special days.</p>;
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-5">
        <h3 className="text-sm font-semibold text-content">Add a special day</h3>
        <p className="mb-3 mt-0.5 text-xs text-muted">
          Different hours for a date or a run of dates. Attendance measures lateness, leaving early and the hours on
          site for those days by these instead of the shift&apos;s usual ones.
        </p>
        <AddForm action={createSpecialDay}>
          <Field label="From" className="w-40">
            <DatePicker name="fromDate" />
          </Field>
          <Field label="To" className="w-40" hint="empty for a single day">
            <DatePicker name="toDate" placeholder="Same day" />
          </Field>
          <Field label="Start" htmlFor="sd-start" className="w-32">
            <Input id="sd-start" name="startTime" type="time" defaultValue="10:00" required />
          </Field>
          <Field label="End" htmlFor="sd-end" className="w-32">
            <Input id="sd-end" name="endTime" type="time" defaultValue="18:00" required />
          </Field>
          <Field label="Grace (min)" htmlFor="sd-grace" className="w-24">
            <Input id="sd-grace" name="graceMinutes" type="number" min={0} max={180} defaultValue={shifts[0].graceMinutes} />
          </Field>
          <Field label="Lunch (min)" htmlFor="sd-lunch" className="w-24">
            <Input id="sd-lunch" name="lunchMinutes" type="number" min={0} max={240} defaultValue={shifts[0].lunchMinutes} />
          </Field>
          <Field label="Note" htmlFor="sd-note" className="min-w-48 flex-1">
            <Input id="sd-note" name="note" placeholder="e.g. Late opening after Diwali" maxLength={120} />
          </Field>
          <fieldset className="w-full space-y-1.5">
            <legend className="text-sm font-medium text-content">Shifts it applies to</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {shifts.map((s) => (
                <label key={s.id} className="inline-flex items-center gap-2 text-sm text-content">
                  <input
                    type="checkbox"
                    name="shiftIds"
                    value={s.id}
                    defaultChecked
                    className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex w-full items-start gap-2 text-sm text-content">
            <input
              type="checkbox"
              name="workingDay"
              className="mt-0.5 size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
            />
            <span>
              Count it as a working day
              <span className="text-muted"> — even where it would be a day off or a holiday, e.g. a Sunday worked</span>
            </span>
          </label>
        </AddForm>
      </div>

      {days.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No special days yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
              <th className="px-5 py-3">Dates</th>
              <th className="px-5 py-3">Hours</th>
              <th className="px-5 py-3">Shifts</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {days.map((d) => (
              <tr key={d.id} className="hover:bg-canvas">
                <td className="px-5 py-3 align-top">
                  <p className="font-medium text-content">
                    {d.from === d.to ? formatISO(d.from) : `${formatISO(d.from)} – ${formatISO(d.to)}`}
                  </p>
                  {d.note && <p className="mt-0.5 text-xs text-muted">{d.note}</p>}
                  {d.workingDay && (
                    <Badge tone="blue" className="mt-1">
                      Working day
                    </Badge>
                  )}
                </td>
                <td className="px-5 py-3 align-top">
                  <p className="text-content">
                    {d.startTime} – {d.endTime}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {d.graceMinutes ? `${d.graceMinutes} min grace` : "no grace"} ·{" "}
                    {d.lunchMinutes ? `${d.lunchMinutes} min lunch` : "no lunch"}
                  </p>
                </td>
                <td className="px-5 py-3 align-top text-muted">{covers(d)}</td>
                <td className="px-5 py-3 text-right align-top">
                  <button
                    type="button"
                    onClick={() => remove(d)}
                    disabled={pending}
                    className="rounded-lg p-1.5 text-faint hover:bg-surface hover:text-red-600 disabled:opacity-50"
                    title="Delete special day"
                    aria-label="Delete special day"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
