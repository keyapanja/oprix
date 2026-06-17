"use client";

import { confirmDialog } from "@/components/ui/confirm";

import { useState, useMemo, useTransition } from "react";
import type { AttendanceType } from "@prisma/client";
import { markAttendance, resetAttendance } from "@/lib/attendance/actions";
import { effectiveStatus } from "@/lib/attendance/resolve";
import { Icon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type AttendanceRow = {
  employeeId: string;
  name: string;
  code: string;
  dept: string;
  recordType: AttendanceType | null;
  markedManually: boolean;
  onLeave: boolean;
};

const STATUS: { value: AttendanceType; label: string; active: string }[] = [
  { value: "PRESENT", label: "Present", active: "bg-emerald-500 text-white" },
  { value: "ABSENT", label: "Absent", active: "bg-red-500 text-white" },
  { value: "HALF_DAY", label: "Half day", active: "bg-amber-500 text-white" },
  { value: "LEAVE", label: "On leave", active: "bg-brand-500 text-white" },
  { value: "HOLIDAY", label: "Holiday", active: "bg-slate-400 text-white" },
];

type Tone = "gray" | "green" | "amber" | "blue" | "red";
const BADGE: Record<AttendanceType, { tone: Tone; label: string }> = {
  PRESENT: { tone: "green", label: "Present" },
  ABSENT: { tone: "red", label: "Absent" },
  HALF_DAY: { tone: "amber", label: "Half day" },
  LEAVE: { tone: "blue", label: "On leave" },
  HOLIDAY: { tone: "gray", label: "Holiday" },
};

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
  const [editing, setEditing] = useState<AttendanceRow | null>(null);

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

  function openEdit(r: AttendanceRow) {
    setEditing(r);
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
            <th className="px-5 py-3 text-right">Log</th>
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
            const hasRecord = !!r.recordType;
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
                {/* Status — display only */}
                <td className="px-5 py-3">
                  {eff ? (
                    <Badge tone={BADGE[eff].tone}>{BADGE[eff].label}</Badge>
                  ) : (
                    <span className="text-sm text-faint">Unmarked</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => openEdit(r)}
                    title={hasRecord ? "Edit attendance" : "Log attendance"}
                    aria-label={hasRecord ? "Edit attendance" : "Log attendance"}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-canvas hover:text-content"
                  >
                    <Icon name={hasRecord ? "pencil" : "plus"} className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-5 py-10 text-center text-sm text-muted">
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

      {editing && (
        <AttendanceEditDialog
          row={editing}
          date={date}
          holiday={holiday}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            update(editing.employeeId, patch);
            setEditing(null);
          }}
          onCleared={() => {
            update(editing.employeeId, { recordType: null, markedManually: false });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function AttendanceEditDialog({
  row,
  date,
  holiday,
  onClose,
  onSaved,
  onCleared,
}: {
  row: AttendanceRow;
  date: string;
  holiday: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<AttendanceRow>) => void;
  onCleared: () => void;
}) {
  const [type, setType] = useState<AttendanceType>(row.recordType ?? (holiday ? "HOLIDAY" : "PRESENT"));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hasRecord = !!row.recordType;

  function save() {
    setErr(null);
    start(async () => {
      const res = await markAttendance({ employeeId: row.employeeId, date, type, clockIn: "", clockOut: "" });
      if (res.error) setErr(res.error);
      else onSaved({ recordType: type, markedManually: true });
    });
  }
  async function clear() {
    if (!(await confirmDialog({ message: `Clear ${row.name}'s attendance for this day? This removes their status.`, tone: "danger", confirmLabel: "Clear" }))) return;
    setErr(null);
    start(async () => {
      const res = await resetAttendance({ employeeId: row.employeeId, date });
      if (res.error) setErr(res.error);
      else onCleared();
    });
  }

  return (
    <Modal onClose={onClose} title={`Log attendance · ${row.name}`}>
      <div className="space-y-4">
        {err && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25">
            {err}
          </div>
        )}

        <Field label="Status">
          <div className="inline-flex flex-wrap gap-1 rounded-xl bg-canvas p-1">
            {STATUS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setType(s.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  type === s.value ? s.active : "text-muted hover:text-content",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-between gap-3 pt-1">
          {hasRecord ? (
            <Button variant="danger" size="sm" onClick={clear} disabled={pending}>
              <Icon name="trash" className="size-4" />
              Clear day
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
