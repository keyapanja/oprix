"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { updateSubmission, getSubmissionHistory, type SubmissionEvent } from "@/lib/forms/actions";
import { FieldInput, type FieldValue } from "@/components/forms/field-input";
import { OptionChip } from "@/components/forms/option-chip";
import {
  answerToText,
  computeCalc,
  formatCalc,
  isInputField,
  isVisible,
  type FieldDef,
  type Lookups,
} from "@/lib/forms/types";

type Entry = {
  id: string;
  data: Record<string, unknown>;
  submitterName: string;
  createdAt: string;
  mine: boolean;
  editedAt: string | null;
  editedByName: string | null;
};

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
  if (field.type === "list") {
    const items = Array.isArray(value) ? (value as unknown[]).filter((x) => typeof x === "string" && x.trim() !== "") : [];
    if (items.length === 0) return <span className="text-sm text-muted">—</span>;
    return (
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-content">
        {items.map((it, i) => (
          <li key={i} className="break-words">
            {String(it)}
          </li>
        ))}
      </ul>
    );
  }

  if (field.type === "dropdown" && field.chips) {
    const s = answerToText(field, value);
    return s ? <OptionChip field={field} value={s} /> : <span className="text-sm text-muted">—</span>;
  }

  if (field.type === "check") {
    return (
      <input
        type="checkbox"
        checked={value === true || value === "true"}
        readOnly
        aria-label={answerToText(field, value)}
        className="pointer-events-none size-4 rounded border-line-strong text-brand-600"
      />
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
  const [history, setHistory] = useState<SubmissionEvent[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const inputFields = fields.filter((f) => isInputField(f.type));

  // Load the edit log lazily the first time the history section is opened.
  useEffect(() => {
    if (!showHistory || history !== null) return;
    let alive = true;
    getSubmissionHistory(entry.id).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [showHistory, history, entry.id]);

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
      else if (f.type === "check") empty = v !== true && v !== "true";
      else if (Array.isArray(v)) empty = v.length === 0;
      else empty = v == null || v === "";
      if (empty) errs[f.id] = f.type === "check" ? "Please tick this box." : "This field is required.";
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
        <div className="space-y-2 border-b border-line pb-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {showSubmitter && (
              <span>
                By <span className="font-medium text-content">{entry.submitterName}</span>
              </span>
            )}
            <span>{new Date(entry.createdAt).toLocaleString()}</span>
            {entry.editedAt && (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25">
                    Edited
                  </span>
                  by <span className="font-medium text-content">{entry.editedByName ?? "someone"}</span> ·{" "}
                  {new Date(entry.editedAt).toLocaleString()}
                </span>
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  className="ml-auto font-medium text-accent-strong hover:underline"
                >
                  {showHistory ? "Hide history" : "View history"}
                </button>
              </>
            )}
          </div>
          {showHistory && entry.editedAt && (
            <div className="rounded-lg bg-canvas/50 p-2.5 ring-1 ring-inset ring-line">
              {history === null ? (
                <p className="text-xs text-muted">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted">No edit history recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h, i) => (
                    <li key={i} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs">
                        <span className="font-medium text-content">{h.actor}</span>
                        <span className="text-muted">{h.action.toLowerCase()}</span>
                        <span className="ml-auto text-faint">{new Date(h.at).toLocaleString()}</span>
                      </div>
                      {h.changes.length > 0 && (
                        <ul className="space-y-0.5 border-l-2 border-line pl-2.5">
                          {h.changes.map((c, j) => (
                            <li key={j} className="break-words text-xs">
                              <span className="font-medium text-content">{c.label}:</span>{" "}
                              <span className="text-muted line-through">{c.from || "—"}</span>
                              <span className="mx-1 text-faint">→</span>
                              <span className="text-content">{c.to || "—"}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
