"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Subtle timing badge with two modes:
 *  - With `assignedDate` (tasks, leave): compares when it was applied/assigned
 *    against `date` (the deadline / leave start). Flags "Backdate" when applied
 *    AFTER the date (retroactive). If `sameDayLabel` is given, also flags it
 *    when applied ON the date (same-day / last-minute). Applied in advance = no
 *    badge.
 *  - Without `assignedDate`: flags when `date` is simply before today (computed
 *    on the client after mount, so it stays hydration-safe).
 */
export function BackdateBadge({
  date,
  assignedDate,
  label = "Backdate",
  sameDayLabel,
}: {
  date: string | Date | null | undefined;
  assignedDate?: string | Date | null;
  label?: string;
  /** When set, also show this label if applied on the same day as `date`. */
  sameDayLabel?: string;
}) {
  const [state, setState] = useState<"none" | "backdate" | "same-day">("none");

  useEffect(() => {
    if (!date) {
      setState("none");
      return;
    }
    const day = (d: string | Date) =>
      typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
    const ref = day(date);
    if (assignedDate) {
      const a = day(assignedDate);
      setState(a > ref ? "backdate" : a === ref && sameDayLabel ? "same-day" : "none");
    } else {
      const n = new Date();
      const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
      setState(ref < today ? "backdate" : "none");
    }
  }, [date, assignedDate, sameDayLabel]);

  if (state === "none") return null;
  return (
    <Badge tone={state === "same-day" ? "blue" : "amber"} className="ml-1.5 shrink-0">
      {state === "same-day" ? sameDayLabel : label}
    </Badge>
  );
}
