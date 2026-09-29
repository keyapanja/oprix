"use client";

import { useEffect, useMemo, useState } from "react";
import { TasksTable, type TaskRow } from "./tasks-table";
import { TaskCalendar } from "./task-calendar";
import { Icon } from "@/components/ui/icons";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/cn";

type Mode = "list" | "calendar";
const MODES: { value: Mode; label: string; icon: string }[] = [
  { value: "list", label: "List", icon: "check" },
  { value: "calendar", label: "Calendar", icon: "calendar" },
];

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

const GROUP_OPTS = [
  { value: "", label: "No grouping" },
  { value: "status", label: "Group: Status" },
  { value: "project", label: "Group: Project" },
  { value: "department", label: "Group: Department" },
];

/**
 * Owns the task filters for *both* views.
 *
 * The filters used to live inside the table, which meant switching to Calendar
 * silently dropped them — and took the filter bar off screen with them. They
 * belong to the workspace instead: one toolbar, one filtered set, two ways of
 * looking at it.
 */
export function TasksWorkspace({
  rows,
  canTrack,
  initialView = "all",
  initialStatus = "ALL",
  showAdvancedFilters,
  today,
}: {
  rows: TaskRow[];
  canTrack: boolean;
  initialView?: View;
  initialStatus?: string;
  showAdvancedFilters?: boolean;
  today: string;
}) {
  const [mode, setMode] = useState<Mode>("list");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [view, setView] = useState<View>(initialView);
  const [dept, setDept] = useState("ALL");
  const [service, setService] = useState("ALL");
  const [project, setProject] = useState("ALL");
  const [groupBy, setGroupBy] = useState("");

  // Keep the view in sync with the URL (sidebar "My tasks" / "Assigned by me"),
  // while still letting the pills below override it.
  const [lastUrlView, setLastUrlView] = useState(initialView);
  if (lastUrlView !== initialView) {
    setLastUrlView(initialView);
    setView(initialView);
  }

  // The grouping choice persists across visits (per device) until changed.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("oprix:tasks-group");
      if (saved !== null) setGroupBy(saved);
    } catch {
      /* ignore */
    }
  }, []);
  function changeGroup(v: string) {
    setGroupBy(v);
    try {
      localStorage.setItem("oprix:tasks-group", v);
    } catch {
      /* ignore */
    }
  }

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

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.projectName && set.add(r.projectName));
    return [{ value: "ALL", label: "All projects" }, ...[...set].sort().map((p) => ({ value: p, label: p }))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (view === "mine" && !r.mine) return false;
      if (view === "created" && !r.createdByMe) return false;
      if (dept !== "ALL" && r.departmentName !== dept) return false;
      if (service !== "ALL" && r.serviceName !== service) return false;
      if (project !== "ALL" && r.projectName !== project) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        (r.serviceName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, status, view, dept, service, project]);

  // Identifies the filter *settings*, not the data. The table jumps back to
  // page 1 when this changes — but not when the 10s LiveRefresh hands us a new
  // copy of the same rows, which would yank someone off page 3 mid-read.
  const filterKey = `${search}|${status}|${view}|${dept}|${service}|${project}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
        <div className="inline-flex rounded-xl bg-canvas p-0.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m.value ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
              )}
            >
              <Icon name={m.icon} className="size-4" />
              {m.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
              onClick={() => setView(v.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                view === v.value ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* min-w-0 so this group can shrink below its content and actually wrap
            on a narrow screen, instead of pushing the page sideways. */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          {showAdvancedFilters && (
            <>
              <div className="w-44">
                <Combobox value={dept} onChange={setDept} options={deptOptions} />
              </div>
              <div className="w-40">
                <Combobox value={service} onChange={setService} options={serviceOptions} />
              </div>
            </>
          )}
          <div className="w-48">
            <Combobox value={project} onChange={setProject} options={projectOptions} />
          </div>
          <div className="w-44">
            <Combobox value={status} onChange={setStatus} options={STATUS_FILTER} />
          </div>
          {/* Grouping only means something for the list. */}
          {mode === "list" && (
            <div className="w-40">
              <Combobox value={groupBy} onChange={changeGroup} options={GROUP_OPTS} />
            </div>
          )}
        </div>
      </div>

      {mode === "list" && (
        <TasksTable rows={filtered} canTrack={canTrack} today={today} groupBy={groupBy} filterKey={filterKey} />
      )}
      {mode === "calendar" && <TaskCalendar tasks={filtered} today={today} />}
    </div>
  );
}
