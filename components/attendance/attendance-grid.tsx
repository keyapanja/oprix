"use client";

import { useState, useTransition } from "react";
import type { AttendanceType } from "@prisma/client";
import { markAttendance } from "@/lib/attendance/actions";
import { cn } from "@/lib/cn";

export type AttendanceRow = {
  employeeId: string;
  name: string;
  code: string;
  dept: string;
  type: AttendanceType | null;
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

export function AttendanceGrid({
  date,
  rows: initialRows,
}: {
  date: string;
  rows: AttendanceRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [, startTransition] = useTransition();

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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
            <th className="px-5 py-3">Employee</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">In</th>
            <th className="px-5 py-3">Out</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
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
                <div className="inline-flex flex-wrap gap-1 rounded-lg bg-canvas p-1">
                  {STATUS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        update(r.employeeId, { type: s.value });
                        save(r.employeeId, { type: s.value });
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        r.type === s.value
                          ? s.active
                          : "text-muted hover:text-content",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
