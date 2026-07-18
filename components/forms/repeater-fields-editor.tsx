"use client";

import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icons";
import { FormulaEditor } from "@/components/forms/formula-editor";
import { cn } from "@/lib/cn";
import {
  REPEATER_SUBTYPES,
  WIDTH_OPTIONS,
  fieldMeta,
  makeField,
  newId,
  type FieldDef,
  type FieldOption,
  type FieldType,
  type RefSource,
} from "@/lib/forms/types";

const SOURCE_OPTS = [
  { value: "clients", label: "Clients" },
  { value: "projects", label: "Projects" },
  { value: "employees", label: "Employees" },
];
const CHOICE = new Set(["dropdown", "multiselect", "radio", "checkbox"]);

/** Compact editor for the fields inside one repeater row. No nesting. */
export function RepeaterFieldsEditor({
  subFields,
  onChange,
}: {
  subFields: FieldDef[];
  onChange: (next: FieldDef[]) => void;
}) {
  const subs = subFields;
  const update = (i: number, patch: Partial<FieldDef>) =>
    onChange(subs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(subs.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= subs.length) return;
    const next = [...subs];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (type: string) => {
    if (type) onChange([...subs, makeField(type as FieldType)]);
  };

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">Fields in each row</span>
      <div className="space-y-2">
        {subs.map((sf, i) => (
          <div key={sf.id} className="rounded-lg p-2.5 ring-1 ring-inset ring-line">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
                {fieldMeta(sf.type).label}
              </span>
              <Input value={sf.label} onChange={(e) => update(i, { label: e.target.value })} />
              <div className="flex shrink-0 items-center">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-faint hover:text-content disabled:opacity-30" title="Move up">
                  <Icon name="chevronDown" className="size-4 rotate-180" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === subs.length - 1} className="rounded p-1 text-faint hover:text-content disabled:opacity-30" title="Move down">
                  <Icon name="chevronDown" className="size-4" />
                </button>
                <button onClick={() => remove(i)} className="rounded p-1 text-faint hover:text-red-600" title="Remove field">
                  <Icon name="trash" className="size-4" />
                </button>
              </div>
            </div>

            {CHOICE.has(sf.type) && <SubOptions options={sf.options ?? []} onChange={(options) => update(i, { options })} />}

            {sf.type === "reference" && (
              <div className="mt-2">
                <Combobox value={sf.source ?? "clients"} onChange={(v) => update(i, { source: v as RefSource })} options={SOURCE_OPTS} />
              </div>
            )}

            {sf.type === "calculation" && (
              <div className="mt-2">
                <FormulaEditor
                  formula={sf.formula ?? ""}
                  decimals={sf.decimals}
                  tokens={subs
                    .filter((x, xi) => xi !== i && (x.type === "number" || x.type === "calculation"))
                    .map((x) => ({ value: `{${x.id}}`, label: x.label || "(field)" }))}
                  onFormula={(s) => update(i, { formula: s })}
                  onDecimals={(n) => update(i, { decimals: n })}
                />
              </div>
            )}

            <div className="mt-2 flex items-center gap-3 text-xs text-content">
              {sf.type !== "calculation" && (
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!sf.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                    className="size-3.5 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                  />
                  Required
                </label>
              )}
              <div className="ml-auto flex gap-1">
                {WIDTH_OPTIONS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => update(i, { width: w.value })}
                    title={w.title}
                    aria-pressed={(sf.width ?? "full") === w.value}
                    className={cn(
                      "rounded px-2 py-0.5 font-medium ring-1 ring-inset",
                      (sf.width ?? "full") === w.value
                        ? "bg-accent-soft text-accent-strong ring-brand-500/30"
                        : "bg-canvas text-muted ring-line hover:text-content",
                    )}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
        {subs.length === 0 && <p className="text-xs text-muted">No fields in the row yet.</p>}
      </div>

      <div className="mt-2">
        <Combobox value="" onChange={add} placeholder="+ Add a field" options={REPEATER_SUBTYPES.map((t) => ({ value: t, label: fieldMeta(t).label }))} />
      </div>
    </div>
  );
}

function SubOptions({ options, onChange }: { options: FieldOption[]; onChange: (o: FieldOption[]) => void }) {
  return (
    <div className="mt-2 space-y-1.5">
      {options.map((o, i) => (
        <div key={o.id} className="flex items-center gap-1.5">
          <Input value={o.label} onChange={(e) => onChange(options.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} />
          <button onClick={() => onChange(options.filter((_, idx) => idx !== i))} className="shrink-0 rounded p-1 text-faint hover:text-red-600" title="Remove option">
            <Icon name="x" className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...options, { id: newId(), label: `Option ${options.length + 1}` }])}
        className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline"
      >
        <Icon name="plus" className="size-3.5" /> Add option
      </button>
    </div>
  );
}
