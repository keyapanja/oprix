"use client";

import { Fragment, useActionState, useEffect, useMemo, useState } from "react";
import { applyLeave, type LeaveState } from "@/lib/leave/actions";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/cn";

type Balance = {
  typeId: string;
  name: string;
  remaining: number;
  allowance: number;
  period: "MONTH" | "YEAR";
  unlimited: boolean;
  used: number;
};

export function ApplyForm({
  balances,
  initialStart = "",
  initialEnd = "",
  bare = false,
  onDone,
}: {
  balances: Balance[];
  initialStart?: string;
  initialEnd?: string;
  bare?: boolean;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<LeaveState, FormData>(applyLeave, {});
  const [resetKey, setResetKey] = useState(0);
  const [kind, setKind] = useState<"LEAVE" | "WFH">("LEAVE");
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [half, setHalf] = useState(false);

  useEffect(() => {
    if (!state.ok) return;
    if (onDone) {
      onDone();
      return;
    }
    setResetKey((k) => k + 1);
    setTypeId("");
    setStart("");
    setEnd("");
    setHalf(false);
    setKind("LEAVE");
  }, [state, onDone]);

  const singleDay = !!start && start === end;
  const selected = useMemo(() => balances.find((b) => b.typeId === typeId), [balances, typeId]);

  const requestedDays = useMemo(() => {
    if (!start || !end) return 0;
    const s = Date.parse(start);
    const e = Date.parse(end);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
    if (singleDay && half) return 0.5;
    return Math.round((e - s) / 86_400_000) + 1;
  }, [start, end, singleDay, half]);

  const periodWord = selected?.period === "MONTH" ? "month" : "year";
  // Unlimited types have no fixed cap, so they're never exhausted / over balance.
  const exhausted =
    kind === "LEAVE" && !!selected && !selected.unlimited && selected.remaining <= 0;
  const overBalance =
    kind === "LEAVE" &&
    !!selected &&
    !selected.unlimited &&
    requestedDays > 0 &&
    requestedDays > selected.remaining;
  const blocked = exhausted || overBalance;

  const form = (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}
      {state.ok && !onDone && (
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25">
          Request submitted for approval.
        </div>
      )}

      <input type="hidden" name="kind" value={kind} />

      <div className="inline-flex rounded-xl bg-canvas p-0.5">
        {(["LEAVE", "WFH"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              kind === k ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
            )}
          >
            {k === "LEAVE" ? "Leave" : "Work from home"}
          </button>
        ))}
      </div>

      <Fragment key={resetKey}>
        <div className="grid gap-4 sm:grid-cols-2">
          {kind === "LEAVE" && (
            <Field label="Leave type" required className="sm:col-span-2">
              <Combobox
                name="leaveTypeId"
                value={typeId}
                onChange={setTypeId}
                placeholder="Select leave type"
                options={balances.map((b) => ({ value: b.typeId, label: b.name }))}
              />
              {selected && (
                <p className={cn("mt-1.5 text-xs font-medium", exhausted ? "text-red-600 dark:text-red-400" : "text-accent-strong")}>
                  {selected.unlimited
                    ? `No fixed limit · ${selected.used} used this ${periodWord}`
                    : `${selected.remaining} of ${selected.allowance} days remaining (per ${periodWord})`}
                </p>
              )}
            </Field>
          )}

          <Field label="Start date" required>
            <DatePicker
              name="startDate"
              value={start}
              onChange={(v) => {
                setStart(v);
                if (!end) setEnd(v);
              }}
            />
          </Field>
          <Field label="End date" required>
            <DatePicker name="endDate" value={end} onChange={setEnd} />
          </Field>
        </div>

        {singleDay && (
          <label className="flex items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              name="isHalfDay"
              checked={half}
              onChange={(e) => setHalf(e.target.checked)}
              className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
            />
            Half day
          </label>
        )}

        <Field label="Reason" htmlFor="apply-reason">
          <Textarea id="apply-reason" name="reason" placeholder="Optional note for your manager…" />
        </Field>
      </Fragment>

      {blocked && selected && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/25">
          {exhausted
            ? `You've used all your ${selected.name} for this ${periodWord} — you can't apply for this leave type.`
            : `This request is ${requestedDays} day(s), but only ${selected.remaining} day(s) of ${selected.name} remain.`}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || blocked}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );

  if (bare) return form;
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-content">Apply for leave or WFH</h3>
      {form}
    </Card>
  );
}
