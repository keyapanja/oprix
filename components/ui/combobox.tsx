"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type ComboOption = { value: string; label: string };

/**
 * Searchable, keyboard-navigable dropdown. Works in two modes:
 *  - Forms: pass `name` and it renders a hidden input carrying the value.
 *  - Controlled: pass `value` + `onChange`.
 * This is the default dropdown for the app — prefer it over a native <select>.
 */
export function Combobox({
  options,
  name,
  id,
  value,
  defaultValue,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel,
  disabled,
}: {
  options: ComboOption[];
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** When set, an explicit "clear" row with this label is shown (value = ""). */
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const current = value !== undefined ? value : internal;
  const selected = options.find((o) => o.value === current);

  const rows = useMemo<ComboOption[]>(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...base] : base;
  }, [options, query, emptyLabel]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(v: string) {
    if (value === undefined) setInternal(v);
    onChange?.(v);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) choose(rows[active].value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl bg-surface px-3.5 text-left text-sm ring-1 ring-inset ring-line-strong shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
      >
        <span className={cn("truncate", selected ? "text-content" : "text-faint")}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevronDown" className="size-4 shrink-0 text-faint" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-elevated shadow-card-hover">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-lg bg-canvas px-2.5 text-sm text-content placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {rows.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">No matches</li>
            ) : (
              rows.map((o, i) => (
                <li key={o.value || "__empty"}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm",
                      i === active ? "bg-canvas" : "",
                      o.value === current ? "font-medium text-accent-strong" : "text-content",
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.value === current && o.value !== "" && (
                      <Icon name="check" className="size-4 text-accent" />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
