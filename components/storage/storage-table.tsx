"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProjectStorageRow } from "@/lib/storage/data";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { PROJECT_STATUS_TONE } from "@/lib/status";
import { formatBytes, humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/cn";

type SortKey = "name" | "client" | "status" | "files" | "bytes";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Project" },
  { key: "client", label: "Client" },
  { key: "status", label: "Status" },
  { key: "files", label: "Files", numeric: true },
  { key: "bytes", label: "Size", numeric: true },
];

export function StorageTable({ rows }: { rows: ProjectStorageRow[] }) {
  const [q, setQ] = useState("");
  // Biggest-first is the question this page exists to answer.
  const [sortKey, setSortKey] = useState<SortKey>("bytes");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hideEmpty, setHideEmpty] = useState(false);

  const total = useMemo(() => rows.reduce((s, r) => s + r.bytes, 0), [rows]);
  const max = useMemo(() => rows.reduce((m, r) => Math.max(m, r.bytes), 0), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (hideEmpty && r.files === 0 && r.links === 0) return false;
      if (!needle) return true;
      return r.name.toLowerCase().includes(needle) || (r.client ?? "").toLowerCase().includes(needle);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "client":
          return (a.client ?? "").localeCompare(b.client ?? "") * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "files":
          return (a.files - b.files) * dir;
        default:
          return (a.bytes - b.bytes) * dir;
      }
    });
  }, [rows, q, hideEmpty, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numbers are interesting from the top; names from A.
      setSortDir(key === "bytes" || key === "files" ? "desc" : "asc");
    }
  }

  const emptyCount = rows.filter((r) => r.files === 0 && r.links === 0).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects or clients…"
          />
        </div>
        {emptyCount > 0 && (
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
              className="size-4"
            />
            Hide {emptyCount} with no files
          </label>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {rows.length === 0 ? "No projects yet." : "No projects match that search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                {COLUMNS.map((c) => (
                  <th key={c.key} className={cn("whitespace-nowrap py-2 pr-4", c.numeric && "text-right")}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-content",
                        sortKey === c.key && "text-content",
                      )}
                    >
                      {c.label}
                      {sortKey === c.key && (
                        <Icon name="chevronDown" className={cn("size-3.5", sortDir === "asc" && "rotate-180")} />
                      )}
                    </button>
                  </th>
                ))}
                <th className="hidden py-2 md:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-canvas/60">
                  <td className="py-2.5 pr-4">
                    <Link href={`/storage/${r.id}`} className="font-medium text-content hover:text-brand-600">
                      {r.name}
                    </Link>
                    {r.links > 0 && (
                      <span className="ml-2 whitespace-nowrap text-xs text-faint">
                        + {r.links} link{r.links === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-muted">{r.client ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={PROJECT_STATUS_TONE[r.status]}>{humanizeEnum(r.status)}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{r.files}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right font-medium tabular-nums text-content">
                    {r.files === 0 ? <span className="font-normal text-faint">—</span> : formatBytes(r.bytes)}
                  </td>
                  <td className="hidden w-40 py-2.5 md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                        <div
                          className="gradient-brand h-full rounded-full"
                          style={{ width: max > 0 ? `${Math.round((r.bytes / max) * 100)}%` : "0%" }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-faint">
                        {total > 0 ? `${Math.round((r.bytes / total) * 100)}%` : "0%"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
