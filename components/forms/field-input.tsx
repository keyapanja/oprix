"use client";

import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { computeCalc, formatCalc, isVisible } from "@/lib/forms/types";
import type { FieldDef, FieldValue, Lookups, RepeaterRows, ScalarValue } from "@/lib/forms/types";

export type { FieldValue } from "@/lib/forms/types";

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/**
 * Renders one form field — shared by the builder's canvas preview (disabled) and
 * the live fill page (interactive). Choice answers store the option *label*;
 * reference answers store the picked name; date ranges store [start, end];
 * repeaters store an array of row objects keyed by sub-field id.
 */
export function FieldInput({
  field,
  value,
  onChange,
  error,
  disabled,
  lookups,
}: {
  field: FieldDef;
  value?: FieldValue;
  onChange?: (v: FieldValue) => void;
  error?: string;
  disabled?: boolean;
  lookups?: Lookups;
}) {
  if (field.type === "heading") {
    return <h3 className="text-base font-semibold text-content">{field.label}</h3>;
  }
  if (field.type === "paragraph") {
    return <p className="whitespace-pre-wrap text-sm text-muted">{field.label}</p>;
  }

  const set = (v: FieldValue) => onChange?.(v);
  const str = typeof value === "string" ? value : "";
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const opts = field.options ?? [];

  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = <Textarea value={str} onChange={(e) => set(e.target.value)} placeholder={field.placeholder} disabled={disabled} />;
      break;
    case "number":
      control = (
        <Input type="number" value={str} min={field.min ?? undefined} max={field.max ?? undefined}
          onChange={(e) => set(e.target.value)} placeholder={field.placeholder} disabled={disabled} />
      );
      break;
    case "email":
    case "phone":
      control = (
        <Input type={field.type === "email" ? "email" : "tel"} value={str}
          onChange={(e) => set(e.target.value)} placeholder={field.placeholder} disabled={disabled} />
      );
      break;
    case "date":
      control = (
        <div className={cn(disabled && "pointer-events-none opacity-60")}>
          <DatePicker value={str} onChange={(v) => set(v)} />
        </div>
      );
      break;
    case "daterange": {
      const start = typeof arr[0] === "string" ? arr[0] : "";
      const end = typeof arr[1] === "string" ? arr[1] : "";
      control = (
        <div className={cn("flex flex-wrap items-center gap-2", disabled && "pointer-events-none opacity-60")}>
          <div className="min-w-36 flex-1"><DatePicker value={start} onChange={(v) => set([v, end])} /></div>
          <span className="text-muted">→</span>
          <div className="min-w-36 flex-1"><DatePicker value={end} onChange={(v) => set([start, v])} /></div>
        </div>
      );
      break;
    }
    case "dropdown":
      control = (
        <Combobox value={str} onChange={set} disabled={disabled} placeholder={field.placeholder || "Select…"}
          options={opts.map((o) => ({ value: o.label, label: o.label }))} />
      );
      break;
    case "calculation": {
      const shown = typeof value === "string" ? value : value == null ? "" : String(value);
      control = (
        <div className="flex h-10 items-center rounded-xl bg-canvas px-3.5 text-sm font-semibold text-content ring-1 ring-inset ring-line">
          {shown || "—"}
        </div>
      );
      break;
    }
    case "reference": {
      const list = lookups?.[field.source ?? "clients"] ?? [];
      control = (
        <Combobox value={str} onChange={set} disabled={disabled}
          placeholder={field.placeholder || (disabled ? `Live ${field.source ?? "clients"} list` : "Select…")}
          options={list} />
      );
      break;
    }
    case "radio":
      control = (
        <div className="space-y-1.5">
          {opts.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-content">
              <input type="radio" name={field.id} checked={str === o.label} onChange={() => set(o.label)} disabled={disabled}
                className="size-4 border-line-strong text-brand-600 focus:ring-brand-500" />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    case "checkbox":
      control = (
        <div className="space-y-1.5">
          {opts.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-content">
              <input type="checkbox" checked={arr.includes(o.label)} onChange={() => set(toggle(arr, o.label))} disabled={disabled}
                className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500" />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    case "multiselect":
      control = (
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => {
            const on = arr.includes(o.label);
            return (
              <button key={o.id} type="button" disabled={disabled} onClick={() => set(toggle(arr, o.label))}
                className={cn("rounded-full px-3 py-1 text-sm ring-1 ring-inset transition-colors",
                  on ? "bg-accent-soft text-accent-strong ring-brand-500/30" : "bg-canvas text-muted ring-line hover:text-content")}>
                {o.label}
              </button>
            );
          })}
        </div>
      );
      break;
    case "yesno":
      control = (
        <div className="flex gap-4">
          {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map((o) => (
            <label key={o.l} className="flex items-center gap-2 text-sm text-content">
              <input type="radio" name={field.id} checked={value === o.v} onChange={() => set(o.v)} disabled={disabled}
                className="size-4 border-line-strong text-brand-600 focus:ring-brand-500" />
              {o.l}
            </label>
          ))}
        </div>
      );
      break;
    case "repeater": {
      const subs = field.subFields ?? [];
      const rows: Record<string, ScalarValue>[] = Array.isArray(value)
        ? (value as RepeaterRows)
        : disabled
          ? [{}]
          : [];
      const updateRow = (i: number, sfId: string, v: ScalarValue) =>
        set(rows.map((r, idx) => (idx === i ? { ...r, [sfId]: v } : r)));
      control = (
        <div className="space-y-3">
          {rows.length === 0 && <p className="text-xs text-muted">No rows yet.</p>}
          {rows.map((row, i) => (
            <div key={i} className="rounded-xl border border-line bg-canvas/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-faint">Row {i + 1}</span>
                {!disabled && (
                  <button type="button" onClick={() => set(rows.filter((_, idx) => idx !== i))}
                    className="rounded-lg p-1 text-faint hover:text-red-600" title="Remove row">
                    <Icon name="trash" className="size-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {subs
                  .filter((sf) => isVisible(sf, row as Record<string, unknown>))
                  .map((sf) => (
                  <div key={sf.id} className={cn((sf.width ?? "full") === "half" ? "sm:col-span-1" : "sm:col-span-2")}>
                    <FieldInput
                      field={sf}
                      value={sf.type === "calculation" ? formatCalc(sf, computeCalc(sf, subs, row as Record<string, unknown>)) : row[sf.id]}
                      disabled={disabled}
                      lookups={lookups}
                      onChange={(v) => updateRow(i, sf.id, v as ScalarValue)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!disabled && (
            <button type="button" onClick={() => set([...rows, {}])}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline">
              <Icon name="plus" className="size-4" /> Add row
            </button>
          )}
        </div>
      );
      break;
    }
    default: // text
      control = (
        <Input value={str} maxLength={field.maxLength ?? undefined} onChange={(e) => set(e.target.value)}
          placeholder={field.placeholder} disabled={disabled} />
      );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-content">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {control}
      {field.helpText && <p className="mt-1 text-xs text-muted">{field.helpText}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
