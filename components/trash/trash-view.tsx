"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrashItem, TrashType } from "@/lib/trash/data";
import { restoreItem, permanentlyDelete, restoreItems, permanentlyDeleteItems } from "@/lib/trash/actions";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { TrashDetailModal } from "@/components/trash/trash-detail-modal";
import { formatDateTime } from "@/lib/format";

const TONE: Record<TrashType, "gray" | "green" | "amber" | "blue" | "red"> = {
  project: "blue",
  client: "green",
  employee: "amber",
  task: "blue",
  leave: "amber",
  announcement: "red",
  kb: "gray",
  holiday: "green",
  form: "blue",
  formEntry: "gray",
};

const keyOf = (it: { type: TrashType; id: string }) => `${it.type}:${it.id}`;

export function TrashView({ items }: { items: TrashItem[] }) {
  const router = useRouter();
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [detail, setDetail] = useState<TrashItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const typeOptions = useMemo(() => {
    const seen = new Map<TrashType, string>();
    for (const i of items) if (!seen.has(i.type)) seen.set(i.type, i.typeLabel);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (type && i.type !== type) return false;
      if (needle && !`${i.label} ${i.sublabel ?? ""} ${i.deletedByName ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, type, q]);

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(keyOf(i)));
  const picks = useMemo(() => filtered.filter((i) => selected.has(keyOf(i))), [filtered, selected]);

  function toggle(it: TrashItem) {
    setSelected((s) => {
      const n = new Set(s);
      const k = keyOf(it);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s);
      if (allSelected) filtered.forEach((i) => n.delete(keyOf(i)));
      else filtered.forEach((i) => n.add(keyOf(i)));
      return n;
    });
  }

  async function restore(it: TrashItem) {
    setBusy(keyOf(it));
    try {
      const res = await restoreItem(it.type, it.id);
      if (res.error) return toast.error(res.error);
      toast.success(`${it.typeLabel} restored`);
      setDetail(null);
      router.refresh();
    } catch {
      toast.error("Couldn't restore this item.");
    } finally {
      setBusy(null);
    }
  }

  async function purge(it: TrashItem) {
    const ok = await confirmDialog({
      message: `Permanently delete “${it.label}”? This can't be undone.`,
      tone: "danger",
      confirmLabel: "Delete permanently",
    });
    if (!ok) return;
    setBusy(keyOf(it));
    try {
      const res = await permanentlyDelete(it.type, it.id);
      if (res.error) return toast.error(res.error);
      toast.success("Permanently deleted");
      setDetail(null);
      router.refresh();
    } catch {
      toast.error("Couldn't permanently delete this item.");
    } finally {
      setBusy(null);
    }
  }

  async function bulkRestore() {
    if (!picks.length) return;
    setBulkBusy(true);
    try {
      const res = await restoreItems(picks.map((i) => ({ type: i.type, id: i.id })));
      toast.success(`Restored ${res.done}${res.failed ? ` · ${res.failed} couldn't be restored` : ""}`);
      setSelected(new Set());
      router.refresh();
    } catch {
      toast.error("Couldn't restore the selected items.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkPurge() {
    if (!picks.length) return;
    const ok = await confirmDialog({
      message: `Permanently delete ${picks.length} item${picks.length === 1 ? "" : "s"}? This can't be undone.`,
      tone: "danger",
      confirmLabel: "Delete permanently",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const res = await permanentlyDeleteItems(picks.map((i) => ({ type: i.type, id: i.id })));
      toast.success(`Deleted ${res.done}${res.failed ? ` · ${res.failed} couldn't be deleted` : ""}`);
      setSelected(new Set());
      router.refresh();
    } catch {
      toast.error("Couldn't delete the selected items.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Combobox options={typeOptions} value={type} onChange={setType} placeholder="All types" emptyLabel="All types" searchPlaceholder="Filter type…" />
        </div>
        <div className="min-w-56 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trash…" />
        </div>
        <p className="shrink-0 text-sm text-muted">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {picks.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-elevated px-4 py-2.5 shadow-card-hover">
          <span className="text-sm font-medium text-content">{picks.length} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-canvas hover:text-content"
            >
              Clear
            </button>
            <button
              onClick={bulkRestore}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-content ring-1 ring-inset ring-line-strong hover:bg-canvas disabled:opacity-50"
            >
              <Icon name="check" className="size-4" />
              Restore
            </button>
            <button
              onClick={bulkPurge}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Icon name="trash" className="size-4" />
              {bulkBusy ? "Working…" : "Delete permanently"}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="px-5 py-16 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-canvas text-faint">
            <Icon name="trash" className="size-6" />
          </span>
          <h2 className="text-lg font-semibold text-content">{items.length === 0 ? "Trash is empty" : "Nothing matches"}</h2>
          <p className="mt-1.5 text-sm text-muted">
            {items.length === 0 ? "Deleted items will appear here, ready to restore." : "Try a different type or clear the search."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <label className="flex items-center gap-3 border-b border-line px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-faint">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
            />
            Select all
          </label>
          <div className="divide-y divide-line">
            {filtered.map((it) => {
              const k = keyOf(it);
              return (
                <div key={k} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-canvas">
                  <input
                    type="checkbox"
                    checked={selected.has(k)}
                    onChange={() => toggle(it)}
                    onClick={(e) => e.stopPropagation()}
                    className="size-4 shrink-0 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                    aria-label={`Select ${it.label}`}
                  />
                  <button onClick={() => setDetail(it)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="w-28 shrink-0">
                      <Badge tone={TONE[it.type]}>{it.typeLabel}</Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-content">{it.label}</p>
                      {it.sublabel && <p className="truncate text-xs text-muted">{it.sublabel}</p>}
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-xs text-muted">Deleted {formatDateTime(it.deletedAt)}</p>
                      {it.deletedByName && <p className="text-xs text-faint">by {it.deletedByName}</p>}
                    </div>
                  </button>
                  <button
                    onClick={() => restore(it)}
                    disabled={busy === k}
                    className="shrink-0 rounded-lg bg-canvas px-3 py-1.5 text-sm font-medium text-accent-strong ring-1 ring-inset ring-line transition-colors hover:bg-surface disabled:opacity-50"
                  >
                    {busy === k ? "…" : "Restore"}
                  </button>
                  <button
                    onClick={() => purge(it)}
                    disabled={busy === k}
                    title="Delete permanently"
                    className="shrink-0 rounded-lg p-1.5 text-faint hover:bg-surface hover:text-red-600 disabled:opacity-50"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {detail && (
        <TrashDetailModal
          item={detail}
          onClose={() => setDetail(null)}
          onRestore={() => restore(detail)}
          onPurge={() => purge(detail)}
          restoring={busy === keyOf(detail)}
          purging={busy === keyOf(detail)}
        />
      )}
    </div>
  );
}
