"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { FieldInput, type FieldValue } from "@/components/forms/field-input";
import { computeCalc, formatCalc, isInputField, isVisible, WIDTH_SPAN_CLASS, type FieldDef, type Lookups } from "@/lib/forms/types";

type SubmitResult = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

export function FormFill({
  form,
  allowMultiple,
  action,
  lookups,
}: {
  form: { id: string; title: string; description: string | null; schema: { fields: FieldDef[] } };
  allowMultiple: boolean;
  action: (formId: string, data: Record<string, unknown>) => Promise<SubmitResult>;
  lookups?: Lookups;
}) {
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const fields = form.schema.fields;

  function setValue(id: string, v: FieldValue) {
    setValues((p) => ({ ...p, [id]: v }));
    if (errors[id]) setErrors((p) => ({ ...p, [id]: "" }));
  }

  function submit() {
    const errs: Record<string, string> = {};
    const vals = values as Record<string, unknown>;
    for (const f of fields) {
      if (!isInputField(f.type) || !f.required) continue;
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
      const res = await action(form.id, values as Record<string, unknown>);
      if (res.error) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setDone(true);
      setValues({});
      setErrors({});
    });
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center">
        <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Icon name="check" className="size-6" />
        </span>
        <h2 className="text-lg font-semibold text-content">Thanks — your response was recorded.</h2>
        {allowMultiple && (
          <Button variant="secondary" className="mt-4" onClick={() => setDone(false)}>
            Submit another response
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold text-content">{form.title}</h1>
      {form.description && <p className="mt-1 text-sm text-muted">{form.description}</p>}

      {fields.length === 0 ? (
        <p className="mt-6 text-sm text-muted">This form has no fields yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 items-start gap-4 sm:grid-cols-12">
          {fields
            .filter((f) => isVisible(f, values as Record<string, unknown>))
            .map((f) => (
            <div key={f.id} className={WIDTH_SPAN_CLASS[f.width ?? "full"]}>
              <FieldInput
                field={f}
                value={
                  f.type === "calculation"
                    ? formatCalc(f, computeCalc(f, fields, values as Record<string, unknown>))
                    : values[f.id]
                }
                onChange={(v) => setValue(f.id, v)}
                error={errors[f.id]}
                lookups={lookups}
              />
            </div>
          ))}
          <div className="sm:col-span-12">
            <Button onClick={submit} disabled={pending}>
              {pending ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
