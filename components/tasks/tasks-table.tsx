"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus, Priority } from "@prisma/client";
import { TASK_STATUS_TONE, PRIORITY_TONE } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { humanizeEnum, formatDate } from "@/lib/format";
import { InlineTimer } from "@/components/timer/inline-timer";
import type { TimerStatusUI } from "@/lib/timer/shared";
import { cn } from "@/lib/cn";

export type TaskRow = {
  id: string;
  name: string;
  projectName: string;
  serviceName: string | null;
  departmentName: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeNames: string[];
  dueDate: string | null;
  mine: boolean;
  createdByMe: boolean;
  timer: { status: TimerStatusUI; baseSeconds: number; runStartedAtMs: number | null; locked: boolean };
};

type View = "all" | "mine" | "created";

const STATUS_FILTER = [
  { value: "ALL", label: "All statuses" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "REDO", label: "Redo" },
  { value: "CLIENT_REVIEW", label: "Client Review" },
  { value: "COMPLETED", label: "Completed" },
];

const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "My tasks" },
  { value: "created", label: "Assigned by me" },
];

export function TasksTable({
  rows,
  canTrack,
  initialView = "all",
  showAdvancedFilters = false,
}: {
  rows: TaskRow[];
  canTrack: boolean;
  initialView?: View;
  showAdvancedFilters?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [view, setView] = useState<View>(initialView);
  const [dept, setDept] = useState("ALL");
  const [service, setService] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Keep the view in sync with the URL (sidebar "My tasks" / "Assigned by me").
  useEffect(() => {
    setView(initialView);
    setPage(1);
  }, [initialView]);

  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.departmentName && set.add(r.departmentName));
    return [{ value: "ALL", label: "All departments" }, ...[...set].sort().map((d) => ({ value: d, label: d }))];
  }, [rows]);

  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.serviceName && set.add(r.serviceName));
    return [{ value: "ALL", label: "All services" }, ...[...set].sort().map((s) => ({ value: s, label: s }))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (view === "mine" && !r.mine) return false;
      if (view === "created" && !r.createdByMe) return false;
      if (dept !== "ALL" && r.departmentName !== dept) return false;
      if (service !== "ALL" && r.serviceName !== service) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        (r.serviceName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, status, view, dept, service]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const startIdx = (current - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="relative max-w-xs flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search tasks…"
            className="h-9 w-full rounded-xl bg-canvas pl-9 pr-3 text-sm text-content placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>

        {/* View: all / mine / assigned by me */}
        <div className="inline-flex rounded-xl bg-canvas p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => {
                setView(v.value);
                setPage(1);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.value ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showAdvancedFilters && (
            <>
              <div className="w-44">
                <Combobox value={dept} onChange={(v) => { setDept(v); setPage(1); }} options={deptOptions} />
              </div>
              <div className="w-40">
                <Combobox value={service} onChange={(v) => { setService(v); setPage(1); }} options={serviceOptions} />
              </div>
            </>
          )}
          <div className="w-44">
            <Combobox value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_FILTER} />
          </div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
            <th className="px-5 py-3">Task</th>
            <th className="px-5 py-3">Project</th>
            <th className="px-5 py-3">Service</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Priority</th>
            <th className="px-5 py-3">Due</th>
            <th className="px-5 py-3">Assignees</th>
            {canTrack && <th className="px-5 py-3 text-right">Timer</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {pageRows.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-canvas" onClick={() => router.push(`/tasks/${r.id}`)}>
              <td className="px-5 py-3 font-medium text-content">{r.name}</td>
              <td className="px-5 py-3 text-muted">{r.projectName}</td>
              <td className="px-5 py-3 text-muted">{r.serviceName ?? "—"}</td>
              <td className="px-5 py-3"><Badge tone={TASK_STATUS_TONE[r.status]}>{humanizeEnum(r.status)}</Badge></td>
              <td className="px-5 py-3"><Badge tone={PRIORITY_TONE[r.priority]}>{humanizeEnum(r.priority)}</Badge></td>
              <td className="px-5 py-3 text-muted">{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
              <td className="px-5 py-3 text-muted">{r.assigneeNames.length ? r.assigneeNames.join(", ") : "—"}</td>
              {canTrack && (
                <td className="px-5 py-3">
                  <div className="flex justify-end">
                    <InlineTimer
                      taskId={r.id}
                      status={r.timer.status}
                      baseSeconds={r.timer.baseSeconds}
                      runStartedAtMs={r.timer.runStartedAtMs}
                      locked={r.timer.locked}
                    />
                  </div>
                </td>
              )}
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={canTrack ? 8 : 7} className="px-5 py-12 text-center text-sm text-muted">No tasks match your filters.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
        <span>{filtered.length === 0 ? "0" : `${startIdx + 1}–${Math.min(startIdx + pageSize, filtered.length)}`} of {filtered.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current <= 1} className="flex size-8 items-center justify-center rounded-lg ring-1 ring-inset ring-line-strong hover:bg-canvas disabled:opacity-40" aria-label="Previous page">
            <Icon name="chevronLeft" className="size-4" />
          </button>
          <span className="tabular-nums">Page {current} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={current >= pages} className="flex size-8 items-center justify-center rounded-lg ring-1 ring-inset ring-line-strong hover:bg-canvas disabled:opacity-40" aria-label="Next page">
            <Icon name="chevronRight" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
