"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
function parseISO(s: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { y: +m[1], m0: +m[2] - 1, d: +m[3] } : null;
}
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
const firstWeekday = (y: number, m0: number) => new Date(y, m0, 1).getDay();

/**
 * Themed date picker — opens on click anywhere in the field, fully styled to
 * the app theme. Stores "YYYY-MM-DD" (same as a native date input) so server
 * actions parse it unchanged. The default dropdown for date selection.
 */
export function DatePicker({
  name,
  id,
  value,
  defaultValue,
  onChange,
  placeholder = "Select date",
  disabled,
}: {
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"days" | "years">("days");
  const [internal, setInternal] = useState(defaultValue ?? "");
  const ref = useRef<HTMLDivElement>(null);

  const current = value !== undefined ? value : internal;
  const sel = current ? parseISO(current) : null;

  const now = new Date();
  const today = { y: now.getFullYear(), m0: now.getMonth(), d: now.getDate() };
  const [view, setView] = useState({ y: sel?.y ?? today.y, m0: sel?.m0 ?? today.m0 });

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle() {
    const next = !open;
    if (next) {
      setView(sel ? { y: sel.y, m0: sel.m0 } : { y: today.y, m0: today.m0 });
      setMode("days");
    }
    setOpen(next);
  }
  function commit(iso: string) {
    if (value === undefined) setInternal(iso);
    onChange?.(iso);
    setOpen(false);
  }
  function prev() {
    if (mode === "years") setView((v) => ({ ...v, y: v.y - 12 }));
    else setView((v) => (v.m0 === 0 ? { y: v.y - 1, m0: 11 } : { y: v.y, m0: v.m0 - 1 }));
  }
  function next() {
    if (mode === "years") setView((v) => ({ ...v, y: v.y + 12 }));
    else setView((v) => (v.m0 === 11 ? { y: v.y + 1, m0: 0 } : { y: v.y, m0: v.m0 + 1 }));
  }

  const dim = daysInMonth(view.y, view.m0);
  const lead = firstWeekday(view.y, view.m0);
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const yearStart = view.y - (((view.y % 12) + 12) % 12);
  const display = sel ? `${sel.d} ${MONTHS_SHORT[sel.m0]} ${sel.y}` : placeholder;

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={toggle}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl bg-surface px-3.5 text-left text-sm shadow-sm ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
      >
        <span className={cn("truncate", sel ? "text-content" : "text-faint")}>{display}</span>
        <Icon name="calendar" className="size-4 shrink-0 text-faint" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-72 rounded-xl border border-line bg-elevated p-3 shadow-card-hover">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prev}
              className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-content"
              aria-label="Previous"
            >
              <Icon name="chevronLeft" className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setMode((m) => (m === "days" ? "years" : "days"))}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-content hover:bg-canvas"
            >
              {mode === "days" ? `${MONTHS[view.m0]} ${view.y}` : `${yearStart} – ${yearStart + 11}`}
            </button>
            <button
              type="button"
              onClick={next}
              className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-content"
              aria-label="Next"
            >
              <Icon name="chevronRight" className="size-4" />
            </button>
          </div>

          {mode === "days" ? (
            <>
              <div className="grid grid-cols-7 text-center text-[11px] font-medium text-faint">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1">{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} />;
                  const isSel = sel && sel.y === view.y && sel.m0 === view.m0 && sel.d === d;
                  const isToday = today.y === view.y && today.m0 === view.m0 && today.d === d;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => commit(toISO(view.y, view.m0, d))}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-lg text-sm transition-colors",
                        isSel
                          ? "gradient-brand-strong font-semibold text-white"
                          : "text-content hover:bg-canvas",
                        !isSel && isToday && "ring-1 ring-inset ring-brand-400",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 12 }, (_, i) => yearStart + i).map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setView((v) => ({ ...v, y }));
                    setMode("days");
                  }}
                  className={cn(
                    "rounded-lg py-2 text-sm transition-colors",
                    y === view.y ? "gradient-brand-strong font-semibold text-white" : "text-content hover:bg-canvas",
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => commit("")}
              className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:text-content"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => commit(toISO(today.y, today.m0, today.d))}
              className="rounded-lg px-2 py-1 text-xs font-medium text-accent-strong hover:underline"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
