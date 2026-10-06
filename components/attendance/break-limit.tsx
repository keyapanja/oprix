"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBreakLimit } from "@/lib/attendance/admin";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { BreakLimit } from "@/lib/attendance/records";

/**
 * The break limit, set right where it's applied. Each change saves on its own
 * and the roster underneath re-judges every day with it, so trying 15 minutes
 * instead of 10 is one edit and a glance — not a trip to settings and back.
 */
export function BreakLimitSetting({ initial }: { initial: BreakLimit }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [on, setOn] = useState(initial.on);
  const [minutes, setMinutes] = useState(String(initial.minutes));
  const [count, setCount] = useState(String(initial.count));
  const [pending, start] = useTransition();

  const whole = (s: string, fallback: number) => (/^\d+$/.test(s.trim()) ? Number(s) : fallback);

  function persist(next: BreakLimit) {
    start(async () => {
      const res = await setBreakLimit(next);
      if (res.error) {
        toast.error(res.error);
        // Back to what's actually stored, so the controls never claim a limit
        // that isn't the one being applied.
        setOn(saved.on);
        setMinutes(String(saved.minutes));
        setCount(String(saved.count));
        return;
      }
      setSaved(next);
      router.refresh();
    });
  }

  /** Save the two numbers if they changed; an empty or broken field goes back. */
  function commit() {
    const next = { on, minutes: whole(minutes, saved.minutes), count: whole(count, saved.count) };
    setMinutes(String(next.minutes));
    setCount(String(next.count));
    if (next.minutes !== saved.minutes || next.count !== saved.count) persist(next);
  }

  function toggle() {
    const next = { on: !on, minutes: whole(minutes, saved.minutes), count: whole(count, saved.count) };
    setOn(next.on);
    persist(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Highlight long breaks"
        disabled={pending}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          on ? "bg-brand-600" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
      <span className="font-medium text-content">Break limit</span>
      {on ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-2 text-muted">
          Highlight a day with more than
          <NumberBox label="Number of breaks" value={count} onChange={setCount} onCommit={commit} />
          {count.trim() === "1" ? "break" : "breaks"} longer than
          <NumberBox label="Break length in minutes" value={minutes} onChange={setMinutes} onCommit={commit} />
          min
        </span>
      ) : (
        <span className="text-muted">Off — breaks aren&apos;t checked.</span>
      )}
      {pending && <span className="text-xs text-faint">Saving…</span>}
    </div>
  );
}

/** Never disabled mid-save: tabbing from one box to the other would lose focus. */
function NumberBox({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="h-8 w-16 rounded-lg bg-surface px-2 text-center text-sm font-medium tabular-nums text-content ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  );
}
