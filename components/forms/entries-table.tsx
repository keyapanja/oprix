"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { deleteSubmission, toggleSubmissionCheck } from "@/lib/forms/actions";
import { answerToText, isInputField, type FieldDef, type Lookups } from "@/lib/forms/types";
import { EntryDetailModal } from "@/components/forms/entry-detail-modal";
import { OptionChip } from "@/components/forms/option-chip";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";

type Row = {
  id: string;
  data: Record<string, unknown>;
  submitterName: string;
  mine: boolean;
  createdAt: string;
  editedAt: string | null;
  editedByName: string | null;
};

type Col = {
  key: string;
  label: string;
  display: (r: Row) => string;
  sortVal: (r: Row) => string | number;
  /** Custom cell rendering (e.g. colour chips); display() still drives CSV/sort/search. */
  renderCell?: (r: Row) => ReactNode;
};

const PAGE_SIZES = [10, 25, 50, 100];

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function EntriesTable({
  formId,
  formTitle,
  fields,
  rows,
  canDeleteAny,
  showSubmitter,
  lookups,
  defaultGroupBy,
}: {
  formId: string;
  formTitle: string;
  fields: FieldDef[];
  rows: Row[];
  canDeleteAny: boolean;
  showSubmitter: boolean;
  lookups?: Lookups;
  defaultGroupBy?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("__date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupKey, setGroupKey] = useState(defaultGroupBy ?? "");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<Row | null>(null);

  // The viewer's own grouping choice persists (per form, per device) and wins
  // over the form's default. "" is a valid saved value (they chose No grouping).
  const storeKey = `oprix:entries-group:${formId}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved !== null) setGroupKey(saved);
    } catch {
      /* ignore */
    }
  }, [storeKey]);
  function setGroup(v: string) {
    setGroupKey(v);
    setPage(0);
    try {
      localStorage.setItem(storeKey, v);
    } catch {
      /* ignore */
    }
  }

  const inputCols = useMemo(() => fields.filter((f) => isInputField(f.type)), [fields]);

  const cols: Col[] = useMemo(() => {
    const list: Col[] = [];
    // Answer columns lead; the "who / when" metadata trails at the end.
    for (const f of inputCols) {
      const numeric = f.type === "number" || f.type === "calculation";
      list.push({
        key: f.id,
        label: f.label,
        display: (r) => answerToText(f, r.data[f.id]),
        sortVal: (r) => (numeric ? Number(answerToText(f, r.data[f.id])) || 0 : answerToText(f, r.data[f.id]).toLowerCase()),
        renderCell:
          f.type === "dropdown" && f.chips
            ? (r) => <OptionChip field={f} value={answerToText(f, r.data[f.id])} />
            : f.type === "check"
              ? (r) => (
                  <CheckCell
                    submissionId={r.id}
                    fieldId={f.id}
                    label={f.label}
                    checked={r.data[f.id] === true || r.data[f.id] === "true"}
                    editable={canDeleteAny || r.mine}
                  />
                )
              : undefined,
      });
    }
    if (showSubmitter)
      list.push({ key: "__submitter", label: "Submitted by", display: (r) => r.submitterName, sortVal: (r) => r.submitterName.toLowerCase() });
    list.push({ key: "__date", label: "Date", display: (r) => new Date(r.createdAt).toLocaleString(), sortVal: (r) => r.createdAt });
    return list;
  }, [inputCols, showSubmitter, canDeleteAny]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => cols.some((c) => c.display(r).toLowerCase().includes(s)));
  }, [rows, q, cols]);

  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey) ?? cols[0];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortVal(a);
      const bv = col.sortVal(b);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [filtered, cols, sortKey, sortDir]);

  const groupOptions = useMemo(() => {
    const opts = [{ value: "", label: "No grouping" }];
    if (showSubmitter) opts.push({ value: "__submitter", label: "Submitter" });
    for (const f of inputCols) opts.push({ value: f.id, label: f.label });
    return opts;
  }, [inputCols, showSubmitter]);

  // A saved/default group key that no longer matches a column (deleted field, or
  // submitter grouping for an own-only viewer) falls back to no grouping.
  const effectiveGroup = useMemo(
    () => (groupOptions.some((o) => o.value === groupKey) ? groupKey : ""),
    [groupOptions, groupKey],
  );

  const groups = useMemo(() => {
    if (!effectiveGroup) return [] as [string, Row[]][];
    const col = cols.find((c) => c.key === effectiveGroup);
    const m = new Map<string, Row[]>();
    for (const r of sorted) {
      const key = (col ? col.display(r) : "") || "—";
      (m.get(key) ?? m.set(key, []).get(key)!).push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [effectiveGroup, sorted, cols]);

  // When grouped by a column, don't repeat that column inside each group's rows.
  const groupedCols = useMemo(() => cols.filter((c) => c.key !== effectiveGroup), [cols, effectiveGroup]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(curPage * pageSize, curPage * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function exportCsv() {
    const header = cols.map((c) => c.label);
    const body = sorted.map((r) => cols.map((c) => c.display(r)));
    const csv = [header, ...body].map((row) => row.map((cell) => csvCell(String(cell ?? ""))).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "form"}-entries.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(id: string) {
    const ok = await confirmDialog({ message: "Delete this entry? It moves to Trash.", tone: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    start(async () => {
      const res = await deleteSubmission(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Entry deleted");
      router.refresh();
    });
  }

  const header = (sortable: boolean, columns: Col[]) => (
    <thead className="border-b border-line bg-canvas/40 text-xs uppercase tracking-wide text-faint">
      <tr>
        {columns.map((c) => (
          <th key={c.key} className="whitespace-nowrap px-4 py-2.5 font-medium">
            {sortable ? (
              <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-content">
                {c.label}
                {sortKey === c.key && <Icon name="chevronDown" className={cn("size-3.5", sortDir === "asc" && "rotate-180")} />}
              </button>
            ) : (
              c.label
            )}
          </th>
        ))}
        <th className="px-4 py-2.5" />
      </tr>
    </thead>
  );

  const renderRow = (r: Row, columns: Col[]) => (
        <tr key={r.id} onClick={() => setView(r)} className="cursor-pointer hover:bg-canvas">
          {columns.map((c) => (
            <td
              key={c.key}
              title={c.display(r)}
              className={cn(
                "px-4 py-2.5",
                c.key === "__submitter"
                  ? "whitespace-nowrap font-medium text-content"
                  : c.key === "__date"
                    ? "whitespace-nowrap text-muted"
                    : c.renderCell
                      ? "whitespace-nowrap text-content"
                      : "max-w-xs truncate text-content",
              )}
            >
              {c.renderCell ? (
                c.renderCell(r)
              ) : c.key === "__date" ? (
                <span className="inline-flex items-center gap-1.5">
                  {c.display(r) || "—"}
                  {r.editedAt && (
                    <span
                      title={`Edited by ${r.editedByName ?? "someone"} on ${new Date(r.editedAt).toLocaleString()}`}
                      className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25"
                    >
                      Edited
                    </span>
                  )}
                </span>
              ) : (
                c.display(r) || "—"
              )}
            </td>
          ))}
          <td className="px-4 py-2.5 text-right">
            {(canDeleteAny || r.mine) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(r.id);
                }}
                disabled={pending}
                className="rounded-lg p-1.5 text-faint hover:bg-surface hover:text-red-600 disabled:opacity-50"
                title="Delete entry"
              >
                <Icon name="trash" className="size-4" />
              </button>
            )}
          </td>
        </tr>
  );

  const body = (data: Row[], columns: Col[]) => (
    <tbody className="divide-y divide-line">{data.map((r) => renderRow(r, columns))}</tbody>
  );

  return (
    <>
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52 max-w-full">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entries…" />
          </div>
          <div className="w-44">
            <Combobox value={effectiveGroup} onChange={setGroup} options={groupOptions} placeholder="Group by…" />
          </div>
          {!effectiveGroup && (
            <div className="w-32">
              <Combobox
                value={String(pageSize)}
                onChange={(v) => { setPageSize(Number(v)); setPage(0); }}
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} / page` }))}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{total} entr{total === 1 ? "y" : "ies"}</span>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={total === 0}>
            <Icon name="download" className="size-4" />
            CSV
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-muted">No entries here.</p>
      ) : effectiveGroup ? (
        // One table for every group → a single horizontal scrollbar and columns
        // that line up across groups. Group titles are full-width rows.
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            {header(false, groupedCols)}
            {groups.map(([gval, grows]) => {
              const open = !collapsed.has(gval);
              return (
                <tbody key={gval} className="divide-y divide-line border-t border-line">
                  <tr>
                    <td colSpan={groupedCols.length + 1} className="p-0">
                      <button
                        onClick={() =>
                          setCollapsed((s) => {
                            const n = new Set(s);
                            if (n.has(gval)) n.delete(gval);
                            else n.add(gval);
                            return n;
                          })
                        }
                        className="flex w-full items-center gap-2 bg-canvas/40 px-4 py-2.5 text-left text-sm font-medium text-content hover:bg-canvas"
                      >
                        <Icon name="chevronDown" className={cn("size-4 text-faint transition-transform", !open && "-rotate-90")} />
                        <span className="truncate">{gval}</span>
                        <span className="text-xs text-muted">({grows.length})</span>
                      </button>
                    </td>
                  </tr>
                  {open && grows.map((r) => renderRow(r, groupedCols))}
                </tbody>
              );
            })}
          </table>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              {header(true, cols)}
              {body(pageRows, cols)}
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm text-muted">
              <span>
                {curPage * pageSize + 1}–{Math.min(total, (curPage + 1) * pageSize)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(curPage - 1)}
                  disabled={curPage === 0}
                  className="rounded-lg px-2.5 py-1 font-medium text-content hover:bg-canvas disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-1 text-xs">
                  {curPage + 1} / {pageCount}
                </span>
                <button
                  onClick={() => setPage(curPage + 1)}
                  disabled={curPage >= pageCount - 1}
                  className="rounded-lg px-2.5 py-1 font-medium text-content hover:bg-canvas disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
    {view && (
      <EntryDetailModal
        fields={fields}
        entry={view}
        lookups={lookups}
        canEdit={canDeleteAny || view.mine}
        showSubmitter={showSubmitter}
        onClose={() => setView(null)}
      />
    )}
    </>
  );
}

/** A single-checkbox entry cell. Read-only for viewers; for a manager or the
 *  submitter it toggles + auto-saves in place (optimistic; history captured). */
function CheckCell({
  submissionId,
  fieldId,
  label,
  checked,
  editable,
}: {
  submissionId: string;
  fieldId: string;
  label: string;
  checked: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(checked);
  // Re-sync when the row refreshes with server-confirmed data.
  useEffect(() => setOn(checked), [checked]);

  if (!editable) {
    return (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        aria-label={label}
        className="pointer-events-none size-4 rounded border-line-strong text-brand-600"
      />
    );
  }

  return (
    <input
      type="checkbox"
      checked={on}
      disabled={pending}
      aria-label={label}
      title={`Toggle ${label}`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.checked;
        setOn(next);
        start(async () => {
          const res = await toggleSubmissionCheck(submissionId, fieldId, next);
          if (res.error) {
            setOn(!next); // revert on failure
            toast.error(res.error);
            return;
          }
          router.refresh();
        });
      }}
      className="size-4 cursor-pointer rounded border-line-strong text-brand-600 focus:ring-brand-500 disabled:opacity-50"
    />
  );
}
