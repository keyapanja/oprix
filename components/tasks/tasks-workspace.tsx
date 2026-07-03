"use client";

import { useState } from "react";
import { TasksTable, type TaskRow } from "./tasks-table";
import { TaskCalendar } from "./task-calendar";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Mode = "list" | "calendar";
const MODES: { value: Mode; label: string; icon: string }[] = [
  { value: "list", label: "List", icon: "check" },
  { value: "calendar", label: "Calendar", icon: "calendar" },
];

export function TasksWorkspace({
  rows,
  canTrack,
  initialView,
  showAdvancedFilters,
  today,
  isSuperAdmin,
}: {
  rows: TaskRow[];
  canTrack: boolean;
  initialView?: "all" | "mine" | "created";
  showAdvancedFilters?: boolean;
  today: string;
  isSuperAdmin: boolean;
}) {
  const [mode, setMode] = useState<Mode>("list");

  return (
    <div className="space-y-4">
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

      {mode === "list" && (
        <TasksTable rows={rows} canTrack={canTrack} initialView={initialView} showAdvancedFilters={showAdvancedFilters} today={today} />
      )}
      {mode === "calendar" && <TaskCalendar tasks={rows} today={today} isSuperAdmin={isSuperAdmin} />}
    </div>
  );
}
