"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AssetRow } from "@/lib/storage/data";
import { deleteAssets } from "@/lib/storage/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { formatBytes, formatDateTime } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { cn } from "@/lib/cn";

type Kind = "project" | "task" | "comment" | "link";
type SortKey = "name" | "where" | "uploader" | "createdAt" | "size";

const KIND_LABEL: Record<Kind, string> = {
  project: "Project files",
  task: "Task files",
  comment: "Comment images",
  link: "Links",
};

function kindOf(a: AssetRow): Kind {
  if (a.url) return "link";
  if (a.inline) return "comment";
  return a.taskId ? "task" : "project";
}

function whereLabel(a: AssetRow): string {
  return a.taskName ?? "Project";
}

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "File" },
  { key: "where", label: "Attached to" },
  { key: "uploader", label: "Uploaded by" },
  { key: "createdAt", label: "Date" },
  { key: "size", label: "Size", numeric: true },
];

/**
 * Every asset a project holds, with manual deletion. Deletes go through
 * `deleteAssets` (gated on org:manage) rather than the per-task attachment
 * rules, because this is the admin console for reclaiming disk.
 */
export function AssetTable({ assets }: { assets: AssetRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  // The reason anyone opens this page is to find the big files.
  const [sortKey, setSortKey] = useState<SortKey>("size");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { project: 0, task: 0, comment: 0, link: 0 };
    for (const a of assets) c[kindOf(a)] += 1;
    return c;
  }, [assets]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = assets.filter((a) => {
      if (kind !== "all" && kindOf(a) !== kind) return false;
      if (!needle) return true;
      return (
        a.fileName.toLowerCase().includes(needle) ||
        (a.title ?? "").toLowerCase().includes(needle) ||
        (a.taskName ?? "").toLowerCase().includes(needle) ||
        a.uploaderName.toLowerCase().includes(needle)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return (a.title || a.fileName).localeCompare(b.title || b.fileName) * dir;
        case "where":
          return whereLabel(a).localeCompare(whereLabel(b)) * dir;
        case "uploader":
          return a.uploaderName.localeCompare(b.uploaderName) * dir;
        case "createdAt":
          return a.createdAt.localeCompare(b.createdAt) * dir;
        default:
          return ((a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)) * dir;
      }
    });
  }, [assets, q, kind, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "size" || key === "createdAt" ? "desc" : "asc");
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Select-all covers what's on screen, not the whole project — otherwise a
  // filter would quietly arm a delete for rows the admin can't see.
  const shownIds = shown.map((a) => a.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) for (const id of shownIds) next.delete(id);
      else for (const id of shownIds) next.add(id);
      return next;
    });
  }

  const picked = useMemo(() => assets.filter((a) => selected.has(a.id)), [assets, selected]);
  const pickedBytes = picked.reduce((s, a) => s + (a.sizeBytes ?? 0), 0);

  async function remove(rows: AssetRow[]) {
    if (!rows.length) return;
    const files = rows.filter((a) => !a.url).length;
    const bytes = rows.reduce((s, a) => s + (a.sizeBytes ?? 0), 0);
    const inlineCount = rows.filter((a) => a.inline).length;

    const one = rows.length === 1;
    const what = one
      ? `“${rows[0].title || rows[0].fileName}”`
      : `${rows.length} items${files ? ` (${formatBytes(bytes)})` : ""}`;
    // Inline images are referenced from a comment/description body, so deleting
    // one leaves a broken image where it was posted. Worth saying out loud.
    const warning =
      inlineCount === 0
        ? ""
        : one
          ? " That image is embedded in a comment or description, so it will break where it was posted."
          : inlineCount === 1
            ? " One of these is embedded in a comment or description, so it will break where it was posted."
            : ` ${inlineCount} of these are embedded in comments or descriptions, so they will break where they were posted.`;

    const ok = await confirmDialog({
      title: one ? "Delete this file?" : "Delete these files?",
      message: `Delete ${what}? ${one ? "It's" : "They're"} erased from disk immediately — this doesn't go to the Trash and can't be undone.${warning}`,
      confirmLabel: one ? "Delete" : `Delete ${rows.length}`,
      cancelLabel: "Keep",
      tone: "danger",
    });
    if (!ok) return;

    start(async () => {
      const res = await deleteAssets(rows.map((a) => a.id));
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setSelected(new Set());
      toast.success(
        res.freed > 0
          ? `${res.deleted} deleted · ${formatBytes(res.freed)} freed`
          : `${res.deleted} deleted`,
      );
      router.refresh();
    });
  }

  const chips: (Kind | "all")[] = [
    "all",
    ...(Object.keys(KIND_LABEL) as Kind[]).filter((k) => counts[k] > 0),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by file, task or uploader…"
          />
        </div>
        {chips.length > 2 && (
          <div className="inline-flex flex-wrap gap-1 rounded-lg bg-canvas p-0.5">
            {chips.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  kind === k ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content",
                )}
              >
                {k === "all" ? `All (${assets.length})` : `${KIND_LABEL[k]} (${counts[k]})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-2.5 ring-1 ring-inset ring-line">
          <p className="text-sm text-content">
            <span className="font-medium">{selected.size} selected</span>
            {pickedBytes > 0 && <span className="text-muted"> · {formatBytes(pickedBytes)}</span>}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={pending}>
              Clear
            </Button>
            <Button variant="danger" size="sm" onClick={() => remove(picked)} disabled={pending}>
              <Icon name="trash" className="size-4" />
              {pending ? "Deleting…" : "Delete selected"}
            </Button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {assets.length === 0 ? "This project has no files yet." : "Nothing matches that filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-faint">
                <th className="w-8 py-2 pr-3">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={allShownSelected}
                    onChange={toggleAllShown}
                    aria-label="Select all shown"
                  />
                </th>
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
                <th className="w-10 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((a) => {
                const label = a.title || a.fileName;
                const href = a.url ? safeHref(a.url) : `/api/files/${a.id}`;
                return (
                  <tr key={a.id} className="transition-colors hover:bg-canvas/60">
                    <td className="py-2.5 pr-3">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={selected.has(a.id)}
                        onChange={() => toggleOne(a.id)}
                        aria-label={`Select ${label}`}
                      />
                    </td>
                    <td className="max-w-72 py-2.5 pr-4">
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium text-content hover:text-brand-600"
                        title={label}
                      >
                        {label}
                      </a>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {a.inline && <Badge tone="gray">In a comment</Badge>}
                        {a.url && <Badge tone="blue">Link</Badge>}
                        {a.missing && <Badge tone="red">File missing</Badge>}
                      </div>
                    </td>
                    <td className="max-w-64 py-2.5 pr-4">
                      {a.taskId ? (
                        <Link
                          href={`/tasks/${a.taskId}`}
                          className="block truncate text-muted hover:text-content"
                          title={a.taskName ?? undefined}
                        >
                          {a.taskName}
                        </Link>
                      ) : (
                        <span className="text-muted">Project</span>
                      )}
                      {a.taskTrashed && <span className="block text-xs text-faint">In the Trash</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-muted">{a.uploaderName}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-muted">{formatDateTime(a.createdAt)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right tabular-nums text-content">
                      {a.url ? <span className="text-faint">—</span> : formatBytes(a.sizeBytes)}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => remove([a])}
                        disabled={pending}
                        aria-label={`Delete ${label}`}
                        title={`Delete ${label}`}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
