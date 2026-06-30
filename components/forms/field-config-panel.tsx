"use client";

import { Input, Textarea } from "@/components/ui/input";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { hasOptions, isInputField, newId, type FieldDef, type FieldOption } from "@/lib/forms/types";

const TEXTY = new Set(["text", "textarea", "number", "email", "phone", "dropdown"]);

export function FieldConfigPanel({
  field,
  onChange,
  onDelete,
  onDuplicate,
}: {
  field: FieldDef;
  onChange: (patch: Partial<FieldDef>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const input = isInputField(field.type);
  const choice = hasOptions(field.type);

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

      {input && (
        <div className="space-y-2 border-t border-line pt-3">
          <label className="flex items-center justify-between text-sm text-content">
            Required
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={(e) => onChange({ required: e.target.checked })}
              className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
            />
          </label>
          <div className="flex items-center justify-between text-sm text-content">
            <span>Width</span>
            <div className="flex gap-1">
              {(["full", "half"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => onChange({ width: w })}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset",
                    (field.width ?? "full") === w
                      ? "bg-accent-soft text-accent-strong ring-brand-500/30"
                      : "bg-canvas text-muted ring-line hover:text-content",
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
