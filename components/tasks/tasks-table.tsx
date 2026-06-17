"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { useEffect, useMemo, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus, Priority } from "@prisma/client";
import { deleteTask, deleteTasks } from "@/lib/projects/actions";
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
  /** Date the task was created/assigned (YYYY-MM-DD) — calendar spans from here to dueDate. */
  assignedDate: string | null;
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

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function togglePage() {
    const ids = pageRows.map((r) => r.id);
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (pageAllSelected ? n.delete(id) : n.add(id)));
      return n;
    });
  }
  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!(await confirmDialog({ message: `Delete ${ids.length} task${ids.length === 1 ? "" : "s"}? This can't be undone.`, tone: "danger", confirmLabel: "Delete" }))) return;
    startBulk(async () => {
      const res = await deleteTasks(ids);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const del = res.deleted ?? 0;
      toast.success(`Deleted ${del} task${del === 1 ? "" : "s"}${res.skipped ? ` · ${res.skipped} skipped` : ""}`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function onEdit(e: MouseEvent, id: string) {
    e.stopPropagation();
    router.push(`/tasks/${id}`);
  }
  async function onDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (!(await confirmDialog({ message: "Delete this task? This can't be undone.", tone: "danger" }))) return;
    setDeletingId(id);
    startDelete(async () => {
      const res = await deleteTask(id);
      setDeletingId(null);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-elevated px-4 py-2.5">
          <span className="text-sm font-medium text-content">
            {selected.size} task{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas hover:text-content"
            >
              Clear
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Icon name="trash" className="size-4" />
              {bulkPending ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        </div>
      )}
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
            <th className="w-10 px-5 py-3">
              <input
                type="checkbox"
                checked={pageAllSelected}
                onChange={togglePage}
                className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                aria-label="Select all on page"
              />
            </th>
            <th className="px-5 py-3">Task</th>
            <th className="px-5 py-3">Project</th>
            <th className="px-5 py-3">Service</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Priority</th>
            <th className="px-5 py-3">Due</th>
            <th className="px-5 py-3">Assignees</th>
            {canTrack && <th className="px-5 py-3 text-right">Timer</th>}
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {pageRows.map((r) => (
            <tr
              key={r.id}
              className={cn("cursor-pointer hover:bg-canvas", selected.has(r.id) && "bg-accent-soft hover:bg-accent-soft")}
              onClick={() => router.push(`/tasks/${r.id}`)}
            >
              <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggleSelect(r.id)}
                  className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                  aria-label={`Select ${r.name}`}
                />
              </td>
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
              <td className="px-5 py-3">
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => onEdit(e, r.id)}
                    title="Edit task"
                    aria-label="Edit task"
                    className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-content"
                  >
                    <Icon name="pencil" className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => onDelete(e, r.id)}
                    disabled={deletingId === r.id}
                    title="Delete task"
                    aria-label="Delete task"
                    className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={canTrack ? 10 : 9} className="px-5 py-12 text-center text-sm text-muted">No tasks match your filters.</td>
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
