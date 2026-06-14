"use client";

import { useState, useMemo, useTransition } from "react";
import type { AttendanceType } from "@prisma/client";
import { markAttendance } from "@/lib/attendance/actions";
import { effectiveStatus } from "@/lib/attendance/resolve";
import { Icon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/cn";

export type AttendanceRow = {
  employeeId: string;
  name: string;
  code: string;
  dept: string;
  recordType: AttendanceType | null;
  markedManually: boolean;
  onLeave: boolean;
  isLate: boolean;
  clockIn: string;
  clockOut: string;
};

const STATUS: { value: AttendanceType; label: string; active: string }[] = [
  { value: "PRESENT", label: "Present", active: "bg-emerald-500 text-white" },
  { value: "ABSENT", label: "Absent", active: "bg-red-500 text-white" },
  { value: "HALF_DAY", label: "Half", active: "bg-amber-500 text-white" },
  { value: "LEAVE", label: "Leave", active: "bg-brand-500 text-white" },
  { value: "HOLIDAY", label: "Holiday", active: "bg-slate-400 text-white" },
];

const PAGE_SIZES = [10, 25, 50];

export function AttendanceGrid({
  date,
  holiday,
  rows: initialRows,
}: {
  date: string;
  holiday: boolean;
  rows: AttendanceRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const r = q
      ? rows.filter(
          (x) =>
            x.name.toLowerCase().includes(q) ||
            x.code.toLowerCase().includes(q) ||
            x.dept.toLowerCase().includes(q),
        )
      : rows;
    return [...r].sort((a, b) =>
      sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }, [rows, search, sortDir]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const startIdx = (current - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  function update(employeeId: string, patch: Partial<AttendanceRow>) {
    setRows((rs) => rs.map((r) => (r.employeeId === employeeId ? { ...r, ...patch } : r)));
  }
  function save(employeeId: string, input: { type?: AttendanceType; clockIn?: string; clockOut?: string }) {
    startTransition(async () => {
      const res = await markAttendance({ employeeId, date, ...input });
      if (res.error) alert(res.error);
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-5 py-16 text-center text-sm text-muted">
        No employees yet. Add people in the Employees section first.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="relative max-w-xs flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search employees…"
            className="h-9 w-full rounded-xl bg-canvas pl-9 pr-3 text-sm text-content placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Per page</span>
          <div className="w-20">
            <Combobox
              value={String(pageSize)}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
            <th className="px-5 py-3">
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="inline-flex items-center gap-1 hover:text-content"
              >
                Employee
                <Icon name="chevronDown" className={cn("size-3.5 transition-transform", sortDir === "desc" && "rotate-180")} />
              </button>
            </th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">In</th>
            <th className="px-5 py-3">Out</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {pageRows.map((r) => {
            const eff = effectiveStatus({
              recordType: r.recordType,
              markedManually: r.markedManually,
              onLeave: r.onLeave,
              holiday,
            });
            return (
              <tr key={r.employeeId} className="hover:bg-canvas">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="gradient-brand flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white">
                      {r.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-medium text-content">{r.name}</p>
                      <p className="text-xs text-muted">{r.code} · {r.dept}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-canvas p-1">
                      {STATUS.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => {
                            update(r.employeeId, { recordType: s.value, markedManually: true });
                            save(r.employeeId, { type: s.value });
                          }}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                            eff === s.value ? s.active : "text-muted hover:text-content",
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {r.isLate && eff === null && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        Not logged in
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <input
                    type="time"
                    value={r.clockIn}
                    onChange={(e) => update(r.employeeId, { clockIn: e.target.value })}
                    onBlur={(e) => save(r.employeeId, { clockIn: e.target.value })}
                    className="h-9 w-32 rounded-lg bg-surface px-2 text-sm text-content ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-brand-500"
                  />
                </td>
                <td className="px-5 py-3">
                  <input
                    type="time"
                    value={r.clockOut}
                    onChange={(e) => update(r.employeeId, { clockOut: e.target.value })}
                    onBlur={(e) => save(r.employeeId, { clockOut: e.target.value })}
                    className="h-9 w-32 rounded-lg bg-surface px-2 text-sm text-content ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-brand-500"
                  />
                </td>
              </tr>
            );
          })}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-sm text-muted">
                No employees match “{search}”.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
        <span>
          {total === 0 ? "0" : `${startIdx + 1}–${Math.min(startIdx + pageSize, total)}`} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={current <= 1}
            className="flex size-8 items-center justify-center rounded-lg ring-1 ring-inset ring-line-strong hover:bg-canvas disabled:opacity-40"
            aria-label="Previous page"
          >
            <Icon name="chevronLeft" className="size-4" />
          </button>
          <span className="tabular-nums">Page {current} / {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={current >= pages}
            className="flex size-8 items-center justify-center rounded-lg ring-1 ring-inset ring-line-strong hover:bg-canvas disabled:opacity-40"
            aria-label="Next page"
          >
            <Icon name="chevronRight" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
