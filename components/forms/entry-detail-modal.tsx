"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { updateSubmission } from "@/lib/forms/actions";
import { FieldInput, type FieldValue } from "@/components/forms/field-input";
import {
  answerToText,
  computeCalc,
  formatCalc,
  isInputField,
  isVisible,
  type FieldDef,
  type Lookups,
} from "@/lib/forms/types";

type Entry = { id: string; data: Record<string, unknown>; submitterName: string; createdAt: string; mine: boolean };

/** Read-only display of one stored answer (repeater rows expanded). */
function ViewValue({ field, value }: { field: FieldDef; value: unknown }) {
  if (field.type === "repeater") {
    const rows = Array.isArray(value) ? value : [];
    const subs = field.subFields ?? [];
    if (rows.length === 0) return <span className="text-sm text-muted">—</span>;
    return (
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg bg-canvas/50 p-2.5 ring-1 ring-inset ring-line">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Row {i + 1}</p>
            <dl className="space-y-0.5">
              {subs.map((sf) => (
                <div key={sf.id} className="flex gap-2 text-sm">
                  <dt className="shrink-0 text-muted">{sf.label}:</dt>
                  <dd className="break-words text-content">{answerToText(sf, (row as Record<string, unknown>)?.[sf.id]) || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }
  const text = answerToText(field, value);
  return <span className="whitespace-pre-wrap break-words text-sm text-content">{text || "—"}</span>;
}

export function EntryDetailModal({
  fields,
  entry,
  lookups,
  canEdit,
  showSubmitter,
  onClose,
}: {
  fields: FieldDef[];
  entry: Entry;
  lookups?: Lookups;
  canEdit: boolean;
  showSubmitter: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, FieldValue>>(() => entry.data as Record<string, FieldValue>);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const inputFields = fields.filter((f) => isInputField(f.type));

  function setValue(id: string, v: FieldValue) {
    setValues((p) => ({ ...p, [id]: v }));
    if (errors[id]) setErrors((p) => ({ ...p, [id]: "" }));
  }

  function save() {
    const vals = values as Record<string, unknown>;
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (!isInputField(f.type) || !f.required || f.type === "calculation") continue;
      if (!isVisible(f, vals)) continue;
      const v = values[f.id];
      let empty: boolean;
      if (f.type === "daterange") empty = !(Array.isArray(v) && v[0] && v[1]);
      else if (f.type === "yesno") empty = v === undefined;
      else if (Array.isArray(v)) empty = v.length === 0;
      else empty = v == null || v === "";
      if (empty) errs[f.id] = "This field is required.";
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Please fill the required fields.");
      return;
    }
    start(async () => {
      const res = await updateSubmission(entry.id, vals);
      if (res.error) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success("Entry updated");
      router.refresh();
      onClose();
    });
  }

  function cancelEdit() {
    setValues(entry.data as Record<string, FieldValue>);
    setErrors({});
    setEditing(false);
  }

  return (
    <Modal onClose={onClose} title={editing ? "Edit entry" : "Entry"}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line pb-3 text-xs text-muted">
          {showSubmitter && (
            <span>
              By <span className="font-medium text-content">{entry.submitterName}</span>
            </span>
          )}
          <span>{new Date(entry.createdAt).toLocaleString()}</span>
        </div>

        {editing ? (
          <div className="space-y-4">
            {inputFields
              .filter((f) => isVisible(f, values as Record<string, unknown>))
              .map((f) => (
                <FieldInput
                  key={f.id}
                  field={f}
                  value={f.type === "calculation" ? formatCalc(f, computeCalc(f, fields, values as Record<string, unknown>)) : values[f.id]}
                  onChange={(v) => setValue(f.id, v)}
                  error={errors[f.id]}
                  lookups={lookups}
                />
              ))}
          </div>
        ) : (
          <dl className="space-y-3">
            {inputFields
              .filter((f) => isVisible(f, entry.data))
              .map((f) => (
                <div key={f.id}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-faint">{f.label}</dt>
                  <dd className="mt-0.5">
                    <ViewValue field={f} value={entry.data[f.id]} />
                  </dd>
                </div>
              ))}
          </dl>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          {editing ? (
            <>
              <button
                onClick={cancelEdit}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-content"
              >
                Cancel
              </button>
              <Button onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : (
            <>
              <span />
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-content"
                >
                  Close
                </button>
                {canEdit && <Button onClick={() => setEditing(true)}>Edit</Button>}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
