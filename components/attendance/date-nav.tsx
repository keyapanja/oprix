"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { shiftISO, formatISO } from "@/lib/dates";

export function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const go = (d: string) => router.push(`/attendance?date=${d}`);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <button
        onClick={() => go(shiftISO(date, -1))}
        className="flex size-9 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-inset ring-line-strong hover:text-content"
        aria-label="Previous day"
      >
        <Icon name="chevronLeft" className="size-4" />
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="h-9 rounded-lg bg-surface px-3 text-sm text-content ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-brand-500"
      />
      <button
        onClick={() => go(shiftISO(date, 1))}
        className="flex size-9 items-center justify-center rounded-lg bg-surface text-muted ring-1 ring-inset ring-line-strong hover:text-content"
        aria-label="Next day"
      >
        <Icon name="chevronRight" className="size-4" />
      </button>
      {date !== today && (
        <button
          onClick={() => go(today)}
          className="h-9 rounded-lg bg-surface px-3 text-sm font-medium text-accent-strong ring-1 ring-inset ring-line-strong hover:bg-canvas"
        >
          Today
        </button>
      )}
      <span className="ml-1 text-sm font-medium text-muted">{formatISO(date)}</span>
    </div>
  );
}
