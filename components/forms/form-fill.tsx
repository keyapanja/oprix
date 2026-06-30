"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { FieldInput, type FieldValue } from "@/components/forms/field-input";
import { isInputField, type FieldDef } from "@/lib/forms/types";
import { cn } from "@/lib/cn";

type SubmitResult = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

export function FormFill({
  form,
  allowMultiple,
  action,
}: {
  form: { id: string; title: string; description: string | null; schema: { fields: FieldDef[] } };
  allowMultiple: boolean;
  action: (formId: string, data: Record<string, unknown>) => Promise<SubmitResult>;
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
    for (const f of fields) {
      if (!isInputField(f.type) || !f.required) continue;
      const v = values[f.id];
      const empty =
        v == null || v === "" || (Array.isArray(v) && v.length === 0) || (f.type === "yesno" && v === undefined);
      if (empty) errs[f.id] = "This field is required.";
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
      <Card className="mx-auto max-w-xl p-8 text-center">
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
    <Card className="mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold text-content">{form.title}</h1>
      {form.description && <p className="mt-1 text-sm text-muted">{form.description}</p>}

      {fields.length === 0 ? (
        <p className="mt-6 text-sm text-muted">This form has no fields yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id} className={cn((f.width ?? "full") === "half" ? "sm:col-span-1" : "sm:col-span-2")}>
              <FieldInput
                field={f}
                value={values[f.id]}
                onChange={(v) => setValue(f.id, v)}
                error={errors[f.id]}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button onClick={submit} disabled={pending}>
              {pending ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
