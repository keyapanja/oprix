"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { humanizeEnum, formatDate } from "@/lib/format";
import { TASK_STATUS_TONE, TASK_STATUS_LABEL, PRIORITY_TONE } from "@/lib/status";
import type { ClientTaskRow } from "@/lib/tasks/client-tasks";

export function ClientTasksList({ rows }: { rows: ClientTaskRow[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.projectName, r.clientName ?? "", r.assigneeNames.join(" "), `#${r.taskNumber ?? ""}`]
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [rows, q]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="w-56 max-w-full">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client tasks…" />
        </div>
        <span className="text-sm text-muted">
          {filtered.length} task{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-muted">
          {rows.length === 0 ? "No client-raised tasks yet." : "No tasks match your search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas/40 text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Task</th>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Assigned to</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Due</th>
                <th className="px-4 py-2.5 font-medium">Raised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-canvas">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                    {r.taskNumber != null ? `#${r.taskNumber}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/tasks/${r.id}`}
                      className="font-medium text-content hover:text-accent-strong hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{r.projectName}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{r.clientName ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                    {r.assigneeNames.length ? r.assigneeNames.join(", ") : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Badge tone={TASK_STATUS_TONE[r.status]}>{TASK_STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Badge tone={PRIORITY_TONE[r.priority]}>{humanizeEnum(r.priority)}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(r.raisedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
