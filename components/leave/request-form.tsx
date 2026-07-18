"use client";

import { Fragment, useActionState, useEffect, useState, type ChangeEvent } from "react";
import { createLeaveRequest, type LeaveState } from "@/lib/leave/actions";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { HALF_DAY_OPTIONS } from "@/lib/leave/half-day";
import { FilePreviewGrid, makePicked, type PickedFile } from "@/components/attachments/file-preview-grid";

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
  const [half, setHalf] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);

  // Only leave types with attachments enabled (e.g. Sick leave) offer upload.
  const showAttachment = !!leaveTypes.find((t) => t.id === typeId)?.attachmentEnabled;

  // On success, upload any picked attachment to the new request, then reset.
  useEffect(() => {
    if (!state.ok || !state.id) return;
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
      setHalf(false);
      setTypeId("");
      setFiles([]);
      toast.success("Leave request added");
      onSuccess?.();
    };
    void done();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = employees.length > 0 && leaveTypes.length > 0;

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
      {!ready && (
        <p className="text-sm text-muted">
          Add at least one employee and one leave type before raising a request.
        </p>
      )}

      <Fragment key={resetKey}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee" required>
            <Combobox
              name="employeeId"
              placeholder="Select employee"
              disabled={!ready}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
            />
          </Field>
          <Field label="Leave type" required>
            <Combobox
              name="leaveTypeId"
              value={typeId}
              onChange={setTypeId}
              placeholder="Select type"
              disabled={!ready}
              options={leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Field>
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
