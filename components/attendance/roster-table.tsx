"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { rowLinkProps, RowLink } from "@/components/ui/row-link";
import { cn } from "@/lib/cn";
import { breakRuleText, hoursMin, type BreakRule } from "@/lib/attendance/punches";
import type { RosterPerson } from "@/lib/attendance/records";

type Col = "name" | "days" | "hours" | "avg" | "late" | "breaks" | "absent" | "flagged";

const COLUMNS: { key: Col; label: string; align?: "right" }[] = [
  { key: "name", label: "Person" },
  { key: "days", label: "Days worked", align: "right" },
  { key: "hours", label: "Hours", align: "right" },
  { key: "avg", label: "Avg / day", align: "right" },
  { key: "late", label: "Late", align: "right" },
  { key: "breaks", label: "Long breaks", align: "right" },
  { key: "absent", label: "Absent", align: "right" },
  { key: "flagged", label: "Needs a look", align: "right" },
];

export function RosterTable({
  people,
  from,
  to,
  breakRule,
}: {
  people: RosterPerson[];
  from: string;
  to: string;
  /** Null while the break limit is switched off — the column goes with it. */
  breakRule: BreakRule | null;
}) {
  const router = useRouter();
  const columns = breakRule ? COLUMNS : COLUMNS.filter((c) => c.key !== "breaks");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: Col; desc: boolean }>({ key: "name", desc: false });
  const [hideQuiet, setHideQuiet] = useState(true);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const avg = (p: RosterPerson) => (p.daysWorked ? p.totalMin / p.daysWorked : 0);
    const value = (p: RosterPerson): number => {
      switch (sort.key) {
        case "days": return p.daysWorked;
        case "hours": return p.totalMin;
        case "avg": return avg(p);
        case "late": return p.lateDays;
        case "breaks": return p.longBreakDays;
        case "absent": return p.absences;
        case "flagged": return p.flagged;
        default: return 0;
      }
    };
    const filtered = people.filter((p) => {
      // Someone with no scans and no absences in the window has nothing to show —
      // usually a new joiner or a leaver, so they're out of the way by default.
      if (hideQuiet && p.daysWorked === 0 && p.absences === 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.employeeCode.toLowerCase().includes(q) ||
        (p.machineCode ?? "").toLowerCase().includes(q) ||
        (p.department ?? "").toLowerCase().includes(q)
      );
    });
    const dir = sort.desc ? -1 : 1;
    return filtered.sort((a, b) =>
      sort.key === "name" ? dir * a.name.localeCompare(b.name) : dir * (value(a) - value(b)) || a.name.localeCompare(b.name),
    );
  }, [people, query, sort, hideQuiet]);

  const quiet = people.length - people.filter((p) => p.daysWorked > 0 || p.absences > 0).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <div className="relative w-full max-w-xs">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code or department"
            className="pl-9"
            aria-label="Search people"
          />
        </div>
        {quiet > 0 && (
          <button
            type="button"
            onClick={() => setHideQuiet(!hideQuiet)}
            className="text-xs font-medium text-accent-strong hover:underline"
          >
            {hideQuiet ? `Show ${quiet} with no records` : `Hide ${quiet} with no records`}
          </button>
        )}
        <span className="ml-auto text-xs text-muted">
          {rows.length} {rows.length === 1 ? "person" : "people"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
              {columns.map((c) => {
                const on = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={cn("px-4 py-3", c.align === "right" && "text-right")}
                    title={c.key === "breaks" && breakRule ? `Days with ${breakRuleText(breakRule)}` : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setSort({ key: c.key, desc: on ? !sort.desc : c.key !== "name" })}
                      className={cn("inline-flex items-center gap-1 uppercase tracking-wider hover:text-content", on && "text-content")}
                    >
                      {c.label}
                      {on && <Icon name="chevronDown" className={cn("size-3", !sort.desc && "rotate-180")} />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted">
                  Nobody matches that.
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const href = `/employees/${p.id}/attendance?from=${from}&to=${to}`;
              const avg = p.daysWorked ? Math.round(p.totalMin / p.daysWorked) : 0;
              return (
                <tr key={p.id} {...rowLinkProps(router, href)} className="cursor-pointer hover:bg-canvas">
                  <td className="px-4 py-3">
                    <RowLink href={href} className="font-medium text-content hover:text-accent">
                      {p.name}
                    </RowLink>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{p.employeeCode}</span>
                      {p.department && <span>· {p.department}</span>}
                      {p.machineCode ? (
                        <span>· device {p.machineCode}</span>
                      ) : (
                        <Badge tone="amber" className="ml-1">no device code</Badge>
                      )}
                      {p.shiftFromDefault && <span className="text-faint">· default shift</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-content">{p.daysWorked || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{p.totalMin ? hoursMin(p.totalMin) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{avg ? hoursMin(avg) : "—"}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums", p.lateDays ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted")}>
                    {!p.shiftStart ? (
                      // Not "—": no shift means lateness was never measured, which
                      // is a different thing from measuring it and finding none.
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">no shift</span>
                    ) : (
                      <>
                        {p.lateDays || "—"}
                        {p.lateDays > 0 && (
                          <span className="ml-1 text-xs font-normal text-faint">{hoursMin(Math.round(p.lateMin / p.lateDays))} avg</span>
                        )}
                      </>
                    )}
                  </td>
                  {breakRule && (
                    <td
                      className={cn("px-4 py-3 text-right tabular-nums", p.longBreakDays ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted")}
                      title={breakTitle(p, breakRule)}
                    >
                      {p.longBreakDays || "—"}
                    </td>
                  )}
                  <td className={cn("px-4 py-3 text-right tabular-nums", p.absences ? "font-medium text-red-600 dark:text-red-400" : "text-muted")}>
                    {p.absences || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.flagged ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        {p.flagged}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** What the long-breaks number stands for, and what it leaves out. */
function breakTitle(p: RosterPerson, rule: BreakRule): string | undefined {
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  const unclear = p.breakUnclearDays ? `${days(p.breakUnclearDays)} can't be told — a scan is missing` : "";
  if (!p.longBreakDays) return unclear || undefined;
  return `${days(p.longBreakDays)} with ${breakRuleText(rule)}${unclear ? ` · ${unclear}` : ""}`;
}
