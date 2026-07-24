"use client";

import { Fragment, useActionState, useEffect, useState, type ChangeEvent } from "react";
import {
  createLeaveRequest,
  getEmployeeBalances,
  type LeaveState,
  type EmployeeBalanceRow,
} from "@/lib/leave/actions";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { HALF_DAY_OPTIONS } from "@/lib/leave/half-day";
import { FilePreviewGrid, makePicked, type PickedFile } from "@/components/attachments/file-preview-grid";
import { cn } from "@/lib/cn";

type Opt = { id: string; name: string };
type TypeOpt = { id: string; name: string; attachmentEnabled: boolean };

export function RequestForm({
  employees,
  leaveTypes,
  onSuccess,
}: {
  employees: Opt[];
  leaveTypes: TypeOpt[];
  /** Called after a request is created (e.g. to close a modal + refresh). */
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState<LeaveState & { id?: string }, FormData>(
    createLeaveRequest,
    {},
  );
  // Remount fields on success so Comboboxes/DatePickers reset too.
  const [resetKey, setResetKey] = useState(0);
  const [kind, setKind] = useState<"LEAVE" | "WFH">("LEAVE");
  const [half, setHalf] = useState(false);
  const [empId, setEmpId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  // Selected employee's per-type balances — powers the exhausted-type warnings.
  const [balances, setBalances] = useState<EmployeeBalanceRow[] | null>(null);
  const [balancesBusy, setBalancesBusy] = useState(false);
  const [exhaustedSwap, setExhaustedSwap] = useState<string | null>(null);

  // Only leave types with attachments enabled (e.g. Sick leave) offer upload — WFH never does.
  const showAttachment = kind === "LEAVE" && !!leaveTypes.find((t) => t.id === typeId)?.attachmentEnabled;

  // Load the picked employee's balances (leave types only; WFH is uncapped).
  useEffect(() => {
    if (!empId) {
      setBalances(null);
      return;
    }
    let live = true;
    setBalancesBusy(true);
    getEmployeeBalances(empId)
      .then((res) => { if (live) setBalances("error" in res ? null : res.rows); })
      .catch(() => { if (live) setBalances(null); })
      .finally(() => { if (live) setBalancesBusy(false); });
    return () => { live = false; };
  }, [empId]);

  const empName = employees.find((e) => e.id === empId)?.name ?? "This employee";
  const unpaidType =
    balances?.find((b) => /unpaid|without pay|lwp/i.test(b.name)) ?? balances?.find((b) => b.unlimited);
  const balanceFor = (id: string) => balances?.find((b) => b.typeId === id);
  const isExhausted = (b: EmployeeBalanceRow) => !b.unlimited && b.remaining <= 0;
  const selectedBal = typeId ? balanceFor(typeId) : undefined;

  function pickType(id: string) {
    const b = balanceFor(id);
    if (b && isExhausted(b) && unpaidType && unpaidType.typeId !== id) {
      setTypeId(unpaidType.typeId); // exhausted → apply as Unpaid Leave
      setExhaustedSwap(b.name);
    } else {
      setTypeId(id);
      setExhaustedSwap(null);
    }
  }

  // If balances arrive after a type was already picked, swap an exhausted one.
  useEffect(() => {
    if (!balances || !typeId) return;
    const b = balanceFor(typeId);
    if (b && isExhausted(b) && unpaidType && unpaidType.typeId !== typeId) {
      setTypeId(unpaidType.typeId);
      setExhaustedSwap(b.name);
    }
  }, [balances]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickEmployee(id: string) {
    setEmpId(id);
    setTypeId("");
    setExhaustedSwap(null);
  }

  // On success, upload any picked attachment to the new request, then reset.
  useEffect(() => {
    if (!state.ok || !state.id) return;
    const submittedKind = kind;
    const done = async () => {
      if (files.length) {
        const up = new FormData();
        for (const p of files) up.append("files", p.file);
        const r = await fetch(`/api/leave/${state.id}/attachments`, { method: "POST", body: up });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          toast.error(`Request added, but the attachment failed to upload: ${j?.error ?? r.statusText}`);
        }
      }
      setResetKey((k) => k + 1);
      setKind("LEAVE");
      setHalf(false);
      setEmpId("");
      setTypeId("");
      setBalances(null);
      setExhaustedSwap(null);
      setFiles([]);
      toast.success(submittedKind === "WFH" ? "WFH request added" : "Leave request added");
      onSuccess?.();
    };
    void done();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasEmployees = employees.length > 0;
  // A leave needs a type; WFH doesn't. So the form is usable for WFH even with no types.
  const ready = hasEmployees && (kind === "WFH" || leaveTypes.length > 0);

  function switchKind(k: "LEAVE" | "WFH") {
    setKind(k);
    if (k === "WFH") {
      setTypeId("");
      setExhaustedSwap(null);
      setFiles([]);
    }
  }

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

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
          {state.error}
        </div>
      )}
      {!hasEmployees && (
        <p className="text-sm text-muted">Add at least one employee before raising a request.</p>
      )}

      {/* Leave vs Work-from-home — WFH doesn't use a leave type or leave balance. */}
      <input type="hidden" name="kind" value={kind} />
      <div className="inline-flex rounded-xl bg-canvas p-0.5">
        {(["LEAVE", "WFH"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            disabled={!hasEmployees}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              kind === k ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
            )}
          >
            {k === "LEAVE" ? "Leave" : "Work from home"}
          </button>
        ))}
      </div>

      {kind === "LEAVE" && hasEmployees && leaveTypes.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Add a leave type first, or switch to Work from home.
        </p>
      )}

      <Fragment key={resetKey}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee" required>
            <Combobox
              name="employeeId"
              value={empId}
              onChange={pickEmployee}
              placeholder="Select employee"
              disabled={!ready}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
            />
          </Field>
          {kind === "LEAVE" && (
            <Field label="Leave type" required>
              <Combobox
                name="leaveTypeId"
                value={typeId}
                onChange={pickType}
                placeholder="Select type"
                disabled={!ready}
                options={leaveTypes.map((t) => {
                  const b = balanceFor(t.id);
                  return { value: t.id, label: b && isExhausted(b) ? `${t.name} · exhausted` : t.name };
                })}
              />
              {selectedBal && !selectedBal.unlimited && (
                <p className={cn("mt-1.5 text-xs font-medium", selectedBal.remaining <= 0 ? "text-red-600 dark:text-red-400" : "text-accent-strong")}>
                  {selectedBal.remaining} of {selectedBal.allowance} left · {selectedBal.used} taken
                </p>
              )}
              {exhaustedSwap && (
                <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  {empName} has used all their {exhaustedSwap} — applying as {unpaidType?.name ?? "Unpaid Leave"}.
                </p>
              )}
              {balancesBusy && empId && <p className="mt-1.5 text-xs text-muted">Checking balance…</p>}
            </Field>
          )}
          <Field label="Start date" required>
            <DatePicker name="startDate" disabled={!ready} />
          </Field>
          <Field label="End date" required>
            <DatePicker name="endDate" disabled={!ready} />
          </Field>
          <Field label="Duration">
            <Combobox
              name="isHalfDay"
              value={half ? "true" : "false"}
              onChange={(v) => setHalf(v === "true")}
              disabled={!ready}
              options={[
                { value: "false", label: "Full day" },
                { value: "true", label: "Half day" },
              ]}
            />
          </Field>
          {half && (
            <Field label="Which half">
              <Combobox
                name="halfDayPeriod"
                defaultValue="FIRST"
                disabled={!ready}
                options={HALF_DAY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Field>
          )}
        </div>
        <Field label="Reason" htmlFor="lr-reason">
          <Textarea id="lr-reason" name="reason" placeholder="Optional note…" disabled={!ready} />
        </Field>
        {showAttachment && (
          <Field label="Attachment" hint="e.g. a medical certificate (optional)">
            <div>
              <FilePreviewGrid files={files} onRemove={removeFile} />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line transition-colors hover:bg-surface">
                <Icon name="plus" className="size-4" />
                Add file
                <input type="file" multiple className="hidden" onChange={onFilesPicked} disabled={!ready} />
              </label>
            </div>
          </Field>
        )}
      </Fragment>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
