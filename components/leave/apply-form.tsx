"use client";

import { Fragment, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { applyLeave } from "@/lib/leave/actions";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { FilePreviewGrid, makePicked, type PickedFile } from "@/components/attachments/file-preview-grid";
import { countWorkingDays, type WorkWeek } from "@/lib/leave/work-week";
import { HALF_DAY_OPTIONS, type HalfDayPeriod } from "@/lib/leave/half-day";
import { cn } from "@/lib/cn";

type Balance = {
  typeId: string;
  name: string;
  remaining: number;
  allowance: number;
  period: "MONTH" | "YEAR";
  unlimited: boolean;
  used: number;
  /** Optional so the calendar's quick-apply (which omits it) stays compatible. */
  attachmentEnabled?: boolean;
};

export function ApplyForm({
  balances,
  initialStart = "",
  initialEnd = "",
  bare = false,
  onDone,
  workWeek,
  holidays,
}: {
  balances: Balance[];
  initialStart?: string;
  initialEnd?: string;
  bare?: boolean;
  onDone?: () => void;
  /** When provided, the day count excludes weekly offs, nth-Saturdays & holidays. */
  workWeek?: WorkWeek;
  holidays?: string[];
}) {
  const [resetKey, setResetKey] = useState(0);
  const [kind, setKind] = useState<"LEAVE" | "WFH">("LEAVE");
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [half, setHalf] = useState(false);
  const [halfPeriod, setHalfPeriod] = useState<HalfDayPeriod>("FIRST");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const singleDay = !!start && start === end;
  const selected = useMemo(() => balances.find((b) => b.typeId === typeId), [balances, typeId]);

  const holidaySet = useMemo(() => new Set(holidays ?? []), [holidays]);
  const requestedDays = useMemo(() => {
    if (!start || !end || start > end) return 0;
    if (workWeek) return countWorkingDays(start, end, workWeek, holidaySet, singleDay && half);
    // Fallback (no work-week passed): naive inclusive count.
    if (singleDay && half) return 0.5;
    return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  }, [start, end, singleDay, half, workWeek, holidaySet]);

  // The whole span is weekends/holidays — nothing to count (server rejects it too).
  const noWorkingDays = !!start && !!end && start <= end && requestedDays === 0;

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
  const blocked = exhausted || overBalance || noWorkingDays;
  const showAttachment = kind === "LEAVE" && !!selected?.attachmentEnabled;

  function onFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    setFiles((f) => [...f, ...makePicked(e.target.files ?? [])]);
    e.target.value = "";
  }
  function removeFile(i: number) {
    setFiles((f) => {
      const p = f[i];
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return f.filter((_, idx) => idx !== i);
    });
  }

  function resetForm() {
    setResetKey((k) => k + 1);
    setTypeId("");
    setStart("");
    setEnd("");
    setHalf(false);
    setHalfPeriod("FIRST");
    setKind("LEAVE");
    setFiles([]);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    // The file input has no `name`, so it isn't serialized into the action's
    // FormData (keeping the server action small); files upload separately below.
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await applyLeave({}, fd);
      if (res.error || !res.id) {
        setError(res.error ?? "Couldn't submit the request.");
        return;
      }
      if (showAttachment && files.length) {
        const up = new FormData();
        for (const p of files) up.append("files", p.file);
        const r = await fetch(`/api/leave/${res.id}/attachments`, { method: "POST", body: up });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          toast.error(`Request submitted, but the attachment failed to upload: ${j?.error ?? r.statusText}`);
        }
      }
      setOk(true);
      if (onDone) {
        onDone();
        return;
      }
      resetForm();
    } catch {
      setError("Couldn't submit the request.");
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {error}
        </div>
      )}
      {ok && !onDone && (
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2 text-content">
              <input
                type="checkbox"
                name="isHalfDay"
                checked={half}
                onChange={(e) => setHalf(e.target.checked)}
                className="size-4"
              />
              Half day
            </label>
            {half &&
              HALF_DAY_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-1.5 text-content">
                  <input
                    type="radio"
                    name="halfDayPeriod"
                    value={o.value}
                    checked={halfPeriod === o.value}
                    onChange={() => setHalfPeriod(o.value)}
                    className="size-4"
                  />
                  {o.label}
                </label>
              ))}
          </div>
        )}

        {requestedDays > 0 && (
          <p className="text-xs font-medium text-accent-strong">
            {requestedDays} {workWeek ? "working " : ""}day{requestedDays === 1 ? "" : "s"}
          </p>
        )}
        {noWorkingDays && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            These dates are all non-working days (weekly offs or holidays) — nothing to count.
          </p>
        )}

        <Field label="Reason" htmlFor="apply-reason">
          <Textarea id="apply-reason" name="reason" placeholder="Optional note for your manager…" />
        </Field>

        {showAttachment && (
          <Field label="Attachment" hint="e.g. a medical certificate (optional)">
            <div>
              <FilePreviewGrid files={files} onRemove={removeFile} />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface">
                <Icon name="plus" className="size-4" />
                Add file
                <input type="file" multiple className="hidden" onChange={onFilesPicked} />
              </label>
            </div>
          </Field>
        )}
      </Fragment>

      {blocked && selected && (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/25">
          {exhausted
            ? `You've used all your ${selected.name} for this ${periodWord} — you can't apply for this leave type.`
            : `This request is ${requestedDays} day(s), but only ${selected.remaining} day(s) of ${selected.name} remain.`}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || blocked}>
          {busy ? "Submitting…" : "Submit request"}
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
