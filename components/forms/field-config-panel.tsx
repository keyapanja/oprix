"use client";

import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { hasOptions, isInputField, newId, WIDTH_OPTIONS, type CondOp, type FieldDef, type FieldOption, type RefSource } from "@/lib/forms/types";
import { RepeaterFieldsEditor } from "@/components/forms/repeater-fields-editor";
import { FormulaEditor } from "@/components/forms/formula-editor";

const TEXTY = new Set(["text", "textarea", "number", "email", "phone", "dropdown", "reference", "list"]);
const SOURCE_OPTS = [
  { value: "clients", label: "Clients" },
  { value: "projects", label: "Projects" },
  { value: "employees", label: "Employees" },
];
const ITEM_TYPE_OPTS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "date", label: "Date" },
];
const OP_OPTS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "doesn't equal" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "notEmpty", label: "is answered" },
  { value: "empty", label: "is empty" },
];

export function FieldConfigPanel({
  field,
  siblings,
  onChange,
  onDelete,
  onDuplicate,
}: {
  field: FieldDef;
  siblings: FieldDef[];
  onChange: (patch: Partial<FieldDef>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const input = isInputField(field.type);
  const choice = hasOptions(field.type);
  const cond = field.visibleWhen;
  const condFields = siblings.filter((s) => s.id !== field.id && isInputField(s.type));

  // Insertable tokens for a calculation's formula: number/calc fields, plus Σ
  // tokens that sum a repeater column.
  const calcTokens: { value: string; label: string }[] = [];
  for (const s of siblings) {
    if (s.id === field.id) continue;
    if (s.type === "number" || s.type === "calculation") calcTokens.push({ value: `{${s.id}}`, label: s.label || "(field)" });
    if (s.type === "repeater")
      for (const sub of s.subFields ?? [])
        if (sub.type === "number" || sub.type === "calculation")
          calcTokens.push({ value: `{${s.id}.${sub.id}}`, label: `Σ ${s.label || "repeater"} › ${sub.label || "field"}` });
  }

  function setOption(i: number, label: string) {
    const next = [...(field.options ?? [])];
    next[i] = { ...next[i], label };
    onChange({ options: next });
  }
  function addOption() {
    const next: FieldOption[] = [...(field.options ?? []), { id: newId(), label: `Option ${(field.options?.length ?? 0) + 1}` }];
    onChange({ options: next });
  }
  function removeOption(i: number) {
    onChange({ options: (field.options ?? []).filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content">Field settings</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={onDuplicate}
            title="Duplicate field"
            className="rounded-lg p-1.5 text-faint hover:bg-canvas hover:text-content"
          >
            <Icon name="copy" className="size-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete field"
            className="rounded-lg p-1.5 text-faint hover:bg-canvas hover:text-red-600"
          >
            <Icon name="trash" className="size-4" />
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">
          {field.type === "heading" ? "Heading text" : field.type === "paragraph" ? "Text" : "Label"}
        </span>
        {field.type === "paragraph" ? (
          <Textarea value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
        ) : (
          <Input value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
        )}
      </label>

      {input && TEXTY.has(field.type) && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Placeholder</span>
          <Input
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            placeholder="Shown inside the empty field"
          />
        </label>
      )}

      {input && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Help text</span>
          <Input
            value={field.helpText ?? ""}
            onChange={(e) => onChange({ helpText: e.target.value })}
            placeholder="Optional hint under the field"
          />
        </label>
      )}

      {field.type === "reference" && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Data source</span>
          <Combobox value={field.source ?? "clients"} onChange={(v) => onChange({ source: v as RefSource })} options={SOURCE_OPTS} />
          <span className="mt-1 block text-xs text-muted">Options come live from your {field.source ?? "clients"}.</span>
        </label>
      )}

      {field.type === "list" && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Entry type</span>
          <Combobox
            value={field.itemType ?? "text"}
            onChange={(v) => onChange({ itemType: v as FieldDef["itemType"] })}
            options={ITEM_TYPE_OPTS}
          />
          <span className="mt-1 block text-xs text-muted">People can add as many of these as they need.</span>
        </label>
      )}

      {field.type === "repeater" && (
        <RepeaterFieldsEditor subFields={field.subFields ?? []} onChange={(subFields) => onChange({ subFields })} />
      )}

      {field.type === "calculation" && (
        <FormulaEditor
          formula={field.formula ?? ""}
          decimals={field.decimals}
          tokens={calcTokens}
          onFormula={(s) => onChange({ formula: s })}
          onDecimals={(n) => onChange({ decimals: n })}
        />
      )}

      {choice && (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">Options</span>
          <div className="space-y-1.5">
            {(field.options ?? []).map((o, i) => (
              <div key={o.id} className="flex items-center gap-1.5">
                <Input value={o.label} onChange={(e) => setOption(i, e.target.value)} />
                <button
                  onClick={() => removeOption(i)}
                  className="shrink-0 rounded-lg p-1.5 text-faint hover:bg-canvas hover:text-red-600"
                  title="Remove option"
                >
                  <Icon name="x" className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addOption}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
          >
            <Icon name="plus" className="size-4" /> Add option
          </button>
        </div>
      )}

      {field.type === "number" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Min</span>
            <Input
              type="number"
              value={field.min ?? ""}
              onChange={(e) => onChange({ min: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Max</span>
            <Input
              type="number"
              value={field.max ?? ""}
              onChange={(e) => onChange({ max: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
        </div>
      )}

      {field.type === "daterange" && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Fixed range length (days)</span>
          <Input
            type="number"
            value={field.rangeDays ?? ""}
            onChange={(e) => onChange({ rangeDays: e.target.value === "" ? null : Math.max(1, Math.round(Number(e.target.value))) })}
            placeholder="Free range"
          />
          <span className="mt-1 block text-xs text-muted">
            End auto-fills this many days from the start (e.g. 7 = a week) and locks. Blank = free range.
          </span>
        </label>
      )}

      {(field.type === "text" || field.type === "textarea") && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Max length</span>
          <Input
            type="number"
            value={field.maxLength ?? ""}
            onChange={(e) => onChange({ maxLength: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="No limit"
          />
        </label>
      )}

      {condFields.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <span className="block text-xs font-medium text-muted">Visibility</span>
          <Combobox
            value={cond ? "cond" : "always"}
            onChange={(v) =>
              onChange({ visibleWhen: v === "cond" ? { fieldId: condFields[0].id, op: "eq", value: "" } : undefined })
            }
            options={[
              { value: "always", label: "Always show" },
              { value: "cond", label: "Show only when…" },
            ]}
          />
          {cond && (
            <div className="space-y-2 rounded-lg p-2 ring-1 ring-inset ring-line">
              <Combobox
                value={cond.fieldId}
                onChange={(v) => onChange({ visibleWhen: { ...cond, fieldId: v } })}
                options={condFields.map((f) => ({ value: f.id, label: f.label || "(untitled)" }))}
              />
              <Combobox
                value={cond.op}
                onChange={(v) => onChange({ visibleWhen: { ...cond, op: v as CondOp } })}
                options={OP_OPTS}
              />
              {cond.op !== "empty" && cond.op !== "notEmpty" && (
                <Input
                  value={cond.value ?? ""}
                  onChange={(e) => onChange({ visibleWhen: { ...cond, value: e.target.value } })}
                  placeholder="value to match"
                />
              )}
            </div>
          )}
        </div>
      )}

      {input && (
        <div className="space-y-2 border-t border-line pt-3">
          {field.type !== "calculation" && (
            <label className="flex items-center justify-between text-sm text-content">
              Required
              <input
                type="checkbox"
                checked={!!field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
              />
            </label>
          )}
          <div className="space-y-1.5 text-sm text-content">
            <span>Width</span>
            <div className="grid grid-cols-4 gap-1.5">
              {WIDTH_OPTIONS.map((w) => {
                const active = (field.width ?? "full") === w.value;
                return (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => onChange({ width: w.value })}
                    title={w.title}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-2 ring-1 ring-inset transition-colors",
                      active
                        ? "bg-accent-soft text-accent-strong ring-brand-500/40"
                        : "bg-canvas text-muted ring-line hover:text-content hover:ring-line-strong",
                    )}
                  >
                    {/* Proportion glyph — a track filled to the field's share of a row. */}
                    <span className="flex h-3.5 w-full overflow-hidden rounded-sm bg-line">
                      <span
                        className={cn("h-full rounded-sm transition-all", active ? "bg-brand-500" : "bg-faint")}
                        style={{ width: w.pct }}
                      />
                    </span>
                    <span className="text-xs font-semibold leading-none">{w.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
