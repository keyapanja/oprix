"use client";

import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/cn";
import type { FieldDef } from "@/lib/forms/types";

export type FieldValue = string | string[] | boolean | undefined;

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/**
 * Renders one form field — shared by the builder's canvas preview (disabled) and
 * the live fill page (interactive). Stores choice answers as the option *label*.
 */
export function FieldInput({
  field,
  value,
  onChange,
  error,
  disabled,
}: {
  field: FieldDef;
  value?: FieldValue;
  onChange?: (v: FieldValue) => void;
  error?: string;
  disabled?: boolean;
}) {
  // Display-only blocks
  if (field.type === "heading") {
    return <h3 className="text-base font-semibold text-content">{field.label}</h3>;
  }
  if (field.type === "paragraph") {
    return <p className="whitespace-pre-wrap text-sm text-muted">{field.label}</p>;
  }

  const set = (v: FieldValue) => onChange?.(v);
  const str = typeof value === "string" ? value : "";
  const arr = Array.isArray(value) ? value : [];
  const opts = field.options ?? [];

  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = (
        <Textarea
          value={str}
          onChange={(e) => set(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      );
      break;
    case "number":
      control = (
        <Input
          type="number"
          value={str}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          onChange={(e) => set(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      );
      break;
    case "email":
    case "phone":
      control = (
        <Input
          type={field.type === "email" ? "email" : "tel"}
          value={str}
          onChange={(e) => set(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      );
      break;
    case "date":
      control = (
        <div className={cn(disabled && "pointer-events-none opacity-60")}>
          <DatePicker value={str} onChange={(v) => set(v)} />
        </div>
      );
      break;
    case "dropdown":
      control = (
        <Combobox
          value={str}
          onChange={set}
          disabled={disabled}
          placeholder={field.placeholder || "Select…"}
          options={opts.map((o) => ({ value: o.label, label: o.label }))}
        />
      );
      break;
    case "radio":
      control = (
        <div className="space-y-1.5">
          {opts.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-content">
              <input
                type="radio"
                name={field.id}
                checked={str === o.label}
                onChange={() => set(o.label)}
                disabled={disabled}
                className="size-4 border-line-strong text-brand-600 focus:ring-brand-500"
              />
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
              <input
                type="checkbox"
                checked={arr.includes(o.label)}
                onChange={() => set(toggle(arr, o.label))}
                disabled={disabled}
                className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
              />
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
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => set(toggle(arr, o.label))}
                className={cn(
                  "rounded-full px-3 py-1 text-sm ring-1 ring-inset transition-colors",
                  on
                    ? "bg-accent-soft text-accent-strong ring-brand-500/30"
                    : "bg-canvas text-muted ring-line hover:text-content",
                )}
              >
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
          {[
            { v: true, l: "Yes" },
            { v: false, l: "No" },
          ].map((o) => (
            <label key={o.l} className="flex items-center gap-2 text-sm text-content">
              <input
                type="radio"
                name={field.id}
                checked={value === o.v}
                onChange={() => set(o.v)}
                disabled={disabled}
                className="size-4 border-line-strong text-brand-600 focus:ring-brand-500"
              />
              {o.l}
            </label>
          ))}
        </div>
      );
      break;
    default: // text
      control = (
        <Input
          value={str}
          maxLength={field.maxLength ?? undefined}
          onChange={(e) => set(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
        />
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
