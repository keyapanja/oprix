"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus, Priority } from "@prisma/client";
import { TASK_STATUS_TONE, PRIORITY_TONE } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { humanizeEnum, formatDate } from "@/lib/format";

export type TaskRow = {
  id: string;
  name: string;
  projectName: string;
  serviceName: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeNames: string[];
  dueDate: string | null;
};

const STATUS_FILTER = [
  { value: "ALL", label: "All statuses" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "COMPLETED", label: "Completed" },
];

export function TasksTable({ rows }: { rows: TaskRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        (r.serviceName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const startIdx = (current - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
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
        <div className="w-44">
          <Combobox
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUS_FILTER}
          />
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
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted">No tasks match your filters.</td>
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
