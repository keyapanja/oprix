"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Subtle "Backdate" badge with two modes:
 *  - With `assignedDate` (tasks): flags only when the task was *assigned after*
 *    its deadline — i.e. created when `date` (the client deadline / due date) was
 *    already in the past. So a task created today for a today/future deadline
 *    never flags, even though its due date is auto-set a day earlier.
 *  - Without `assignedDate` (e.g. leave): flags when `date` is simply before
 *    today (computed on the client after mount, so it stays hydration-safe).
 */
export function BackdateBadge({
  date,
  assignedDate,
  label = "Backdate",
}: {
  date: string | Date | null | undefined;
  assignedDate?: string | Date | null;
  label?: string;
}) {
  const [backdated, setBackdated] = useState(false);

  useEffect(() => {
    if (!date) {
      setBackdated(false);
      return;
    }
    const day = (d: string | Date) =>
      typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
    const ref = day(date);
    if (assignedDate) {
      // Task mode: assigned after the deadline had already passed.
      setBackdated(day(assignedDate) > ref);
    } else {
      const n = new Date();
      const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
      setBackdated(ref < today);
    }
  }, [date, assignedDate]);

  if (!backdated) return null;
  return (
    <Badge tone="amber" className="ml-1.5 shrink-0">
      {label}
    </Badge>
  );
}
