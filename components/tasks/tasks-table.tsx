"use client";

import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { Fragment, useMemo, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus, Priority } from "@prisma/client";
import { deleteTask, deleteTasks, duplicateTask } from "@/lib/projects/actions";
import { TASK_STATUS_TONE, PRIORITY_TONE } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { rowLinkProps, RowLink } from "@/components/ui/row-link";
import { humanizeEnum, formatDate, formatDateTime } from "@/lib/format";
import { safeHref, isHttpUrl } from "@/lib/url";
import { fmtHm, type TimerStatusUI } from "@/lib/timer/shared";
import { cn } from "@/lib/cn";

export type TaskRow = {
  id: string;
  taskNumber: number | null;
  name: string;
  projectName: string;
  serviceName: string | null;
  departmentName: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeNames: string[];
  dueDate: string | null;
  /** Client deadline (YYYY-MM-DD); the due date is auto-set a day before it. */
  clientDeadline: string | null;
  /** Date the task was created/assigned (YYYY-MM-DD) — calendar spans from here to dueDate. */
  assignedDate: string | null;
  createdByName: string | null;
  description: string | null;
  finalLink: string | null;
  /** Date the work was submitted/delivered (YYYY-MM-DD), or null if not yet. */
  deliveredOnISO: string | null;
  /** Full ISO datetime the task was assigned (created) and delivered (submitted). */
  assignedAtISO: string | null;
  deliveredAtISO: string | null;
  totalSeconds: number;
  mine: boolean;
  createdByMe: boolean;
  timer: { status: TimerStatusUI; baseSeconds: number; runStartedAtMs: number | null; locked: boolean };
};

/** Multi-word department → initials (Business Manager → "BM"); single word kept as-is. */
function deptAbbrev(name: string | null): string | null {
  if (!name) return null;
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((w) => w[0]!.toUpperCase()).join("") : words[0];
}

/** Human-readable Task ID: "Dept - 1234" (number). Short-id only as a last resort. */
function taskCode(r: TaskRow): string {
  const num = r.taskNumber != null ? String(r.taskNumber) : r.id.slice(-6).toUpperCase();
  const prefix = deptAbbrev(r.departmentName);
  return prefix ? `${prefix} - ${num}` : num;
}

/** On-time / delayed verdict for a row, plus how many days late (if any). */
function deliveryInfo(r: TaskRow, todayISO: string): { verdict: "ontime" | "delayed" | null; delayedDays: number } {
  if (!r.dueDate) return { verdict: null, delayedDays: 0 };
  const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  if (r.deliveredOnISO) {
    return r.deliveredOnISO <= r.dueDate
      ? { verdict: "ontime", delayedDays: 0 }
      : { verdict: "delayed", delayedDays: diff(r.dueDate, r.deliveredOnISO) };
  }
  const active = r.status === "TODO" || r.status === "IN_PROGRESS" || r.status === "REDO";
  if (active && todayISO > r.dueDate) return { verdict: "delayed", delayedDays: diff(r.dueDate, todayISO) };
  return { verdict: null, delayedDays: 0 };
}

// Status groups render in workflow order, not alphabetical.
const STATUS_ORDER = ["TODO", "IN_PROGRESS", "REVIEW", "REDO", "CLIENT_REVIEW", "COMPLETED", "HOLD"];

/**
 * Renders the rows it's given. Filtering and grouping are chosen in the
 * workspace toolbar above, so the calendar view can act on the same choices.
 */
export function TasksTable({
  rows,
  canTrack,
  today,
  groupBy,
  filterKey,
}: {
  rows: TaskRow[];
  canTrack: boolean;
  today: string;
  groupBy: string;
  /** Changes when the filter *settings* change — see TasksWorkspace. */
  filterKey: string;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Narrowing the list should land you back at the start of it. Adjusted during
  // render rather than in an effect, so page 3 of the old result set never gets
  // painted first. Keyed on the filter settings, not on `rows` — those get a
  // fresh identity every time the 10s refresh runs, which would bounce anyone
  // reading page 3 back to the top.
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  function toggleCollapse(key: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const startIdx = (current - 1) * pageSize;
  const pageRows = rows.slice(startIdx, startIdx + pageSize);

  const colSpan = 19;
  const groups = useMemo(() => {
    if (!groupBy) return [] as { key: string; label: string; rows: TaskRow[] }[];
    const m = new Map<string, TaskRow[]>();
    for (const r of rows) {
      const key =
        groupBy === "status" ? r.status : groupBy === "project" ? r.projectName || "—" : r.departmentName || "No department";
      (m.get(key) ?? m.set(key, []).get(key)!).push(r);
    }
    const entries = [...m.entries()];
    if (groupBy === "status") {
      entries.sort((a, b) => STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]));
      return entries.map(([key, rows]) => ({ key, label: humanizeEnum(key), rows }));
    }
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries.map(([key, rows]) => ({ key, label: key, rows }));
  }, [groupBy, rows]);
  // Selection "select all" targets what's on screen: the page, or all rows when grouped.
  const visibleRows = groupBy ? rows : pageRows;

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();
  const pageAllSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function togglePage() {
    const ids = visibleRows.map((r) => r.id);
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (pageAllSelected ? n.delete(id) : n.add(id)));
      return n;
    });
  }
  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!(await confirmDialog({ message: `Move ${ids.length} task${ids.length === 1 ? "" : "s"} to trash? A Super Admin can restore them.`, tone: "danger", confirmLabel: "Delete" }))) return;
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
    if (!(await confirmDialog({ message: "Move this task to trash? A Super Admin can restore it.", tone: "danger" }))) return;
    setDeletingId(id);
    startDelete(async () => {
      const res = await deleteTask(id);
      setDeletingId(null);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }
  async function onDuplicate(e: MouseEvent, id: string) {
    e.stopPropagation();
    setDuplicatingId(id);
    startDelete(async () => {
      const res = await duplicateTask(id);
      setDuplicatingId(null);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Task duplicated");
        router.refresh();
      }
    });
  }

  const renderRow = (r: TaskRow) => {
    const rowSel = selected.has(r.id);
    // Frozen columns need an opaque bg that tracks the row's hover/selected state.
    const stickyBg = rowSel ? "bg-accent-soft" : "bg-surface group-hover:bg-canvas";
    const di = deliveryInfo(r, today);
    const href = `/tasks/${r.id}`;
    return (
    <tr
      key={r.id}
      className={cn("group cursor-pointer border-b border-line", rowSel ? "bg-accent-soft" : "hover:bg-canvas")}
      {...rowLinkProps(router, href)}
    >
      <td className={cn("sticky left-0 z-[1] w-12 px-4 py-2", stickyBg)} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={rowSel}
          onChange={() => toggleSelect(r.id)}
          className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
          aria-label={`Select ${r.name}`}
        />
      </td>
      {/* These two are real anchors: right-click gives "Open in new tab", and
          the status bar previews the URL. The row handlers above carry the
          modifier clicks across the cells that aren't links. */}
      <td className={cn("sticky left-12 z-[1] whitespace-nowrap border-r border-line px-4 py-2 text-xs font-medium text-muted", stickyBg)}>
        <RowLink href={href} className="hover:text-accent-strong">{taskCode(r)}</RowLink>
      </td>
      <td className="px-4 py-2 font-medium text-content">
        <RowLink href={href} className="block max-w-[16rem] truncate hover:text-accent-strong" title={r.name}>{r.name}</RowLink>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-muted"><span className="block max-w-[11rem] truncate" title={r.serviceName ?? ""}>{r.serviceName ?? "—"}</span></td>
      <td className="whitespace-nowrap px-4 py-2 text-muted"><span className="block max-w-[11rem] truncate" title={r.projectName}>{r.projectName}</span></td>
      <td className="px-4 py-2 text-muted"><span className="block max-w-[18rem] truncate" title={r.description ?? ""}>{r.description || "—"}</span></td>
      <td className="px-4 py-2 text-muted"><span className="block max-w-[12rem] truncate" title={r.assigneeNames.join(", ")}>{r.assigneeNames.length ? r.assigneeNames.join(", ") : "—"}</span></td>
      <td className="whitespace-nowrap px-4 py-2 text-muted">{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
      <td className="whitespace-nowrap px-4 py-2 text-muted">{r.clientDeadline ? formatDate(r.clientDeadline) : "—"}</td>
      <td className="whitespace-nowrap px-4 py-2"><Badge tone={TASK_STATUS_TONE[r.status]} className="whitespace-nowrap">{humanizeEnum(r.status)}</Badge></td>
      <td className="whitespace-nowrap px-4 py-2"><Badge tone={PRIORITY_TONE[r.priority]} className="whitespace-nowrap">{humanizeEnum(r.priority)}</Badge></td>
      <td className="whitespace-nowrap px-4 py-2 text-muted">{r.assignedAtISO ? formatDateTime(r.assignedAtISO) : "—"}</td>
      <td className="whitespace-nowrap px-4 py-2 text-muted">{r.departmentName ?? "—"}</td>
      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
        {r.finalLink ? (
          isHttpUrl(r.finalLink) ? (
            <a href={safeHref(r.finalLink)} target="_blank" rel="noreferrer" className="block max-w-[12rem] truncate text-accent-strong hover:underline" title={r.finalLink}>{r.finalLink}</a>
          ) : (
            <span className="block max-w-[12rem] truncate text-content" title={r.finalLink}>{r.finalLink}</span>
          )
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-muted">{r.deliveredAtISO ? formatDateTime(r.deliveredAtISO) : "—"}</td>
      <td className="whitespace-nowrap px-4 py-2">
        {di.verdict === "ontime" ? (
          <Badge tone="green" className="whitespace-nowrap">On time</Badge>
        ) : di.verdict === "delayed" ? (
          <Badge tone="red" className="whitespace-nowrap">Delayed</Badge>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2">
        {di.delayedDays > 0 ? (
          <span className="font-medium text-red-600 dark:text-red-400">{di.delayedDays} day{di.delayedDays === 1 ? "" : "s"}</span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted">{r.totalSeconds > 0 ? fmtHm(r.totalSeconds) : "—"}</td>
      <td className={cn("sticky right-0 z-[1] border-l border-line px-4 py-2", stickyBg)}>
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={(e) => onEdit(e, r.id)} title="Edit task" aria-label="Edit task" className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-content">
            <Icon name="pencil" className="size-4" />
          </button>
          <button type="button" onClick={(e) => onDuplicate(e, r.id)} disabled={duplicatingId === r.id} title="Duplicate task" aria-label="Duplicate task" className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-content disabled:opacity-40">
            <Icon name="copy" className="size-4" />
          </button>
          <button type="button" onClick={(e) => onDelete(e, r.id)} disabled={deletingId === r.id} title="Delete task" aria-label="Delete task" className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400">
            <Icon name="trash" className="size-4" />
          </button>
        </div>
      </td>
    </tr>
    );
  };

  const emptyRow = (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-muted">No tasks match your filters.</td>
    </tr>
  );

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
      <div className="max-h-[70vh] overflow-auto">
      <table className="w-full text-sm [&_td]:border-r [&_td]:border-line [&_th]:border-r [&_th]:border-line">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-faint">
            <th className="sticky left-0 top-0 z-30 w-12 border-b border-line bg-surface px-4 py-2">
              <input
                type="checkbox"
                checked={pageAllSelected}
                onChange={togglePage}
                className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                aria-label="Select all on page"
              />
            </th>
            <th className="sticky left-12 top-0 z-30 whitespace-nowrap border-b border-r border-line bg-surface px-4 py-2">Task ID</th>
            <th className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2">Task</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Type of task</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Project</th>
            <th className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2">Description</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Assigned to</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Due date</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Client deadline</th>
            <th className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2">Status</th>
            <th className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2">Priority</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Assigned on</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Department</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Final link</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Delivered on</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Delivery status</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Delayed by</th>
            <th className="sticky top-0 z-20 whitespace-nowrap border-b border-line bg-surface px-4 py-2">Total time</th>
            <th className="sticky right-0 top-0 z-30 whitespace-nowrap border-b border-l border-line bg-surface px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {!groupBy ? (
            <>
              {pageRows.map(renderRow)}
              {pageRows.length === 0 && emptyRow}
            </>
          ) : groups.length === 0 ? (
            emptyRow
          ) : (
            groups.map((g, gi) => {
              const open = !collapsed.has(g.key);
              return (
                <Fragment key={`g-${g.key}`}>
                  <tr>
                    <td
                      colSpan={colSpan}
                      className={cn(
                        "border-b border-line-strong bg-canvas px-4 py-2.5",
                        gi > 0 && "border-t-4",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCollapse(g.key)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <Icon name="chevronDown" className={cn("size-4 text-faint transition-transform", !open && "-rotate-90")} />
                        <span className="text-xs font-semibold uppercase tracking-wider text-content">{g.label}</span>
                        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-inset ring-line">
                          {g.rows.length}
                        </span>
                      </button>
                    </td>
                  </tr>
                  {open && g.rows.map(renderRow)}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
      </div>

      {!groupBy ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
          <span>{rows.length === 0 ? "0" : `${startIdx + 1}–${Math.min(startIdx + pageSize, rows.length)}`} of {rows.length}</span>
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
      ) : (
        <div className="border-t border-line px-5 py-3 text-sm text-muted">
          {rows.length} task{rows.length === 1 ? "" : "s"} in {groups.length} group{groups.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
