"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrashItem, TrashType } from "@/lib/trash/data";
import { restoreItem } from "@/lib/trash/actions";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
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
};

export function TrashView({ items }: { items: TrashItem[] }) {
  const router = useRouter();
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<TrashItem | null>(null);

  // Only offer type filters that actually have trashed items.
  const typeOptions = useMemo(() => {
    const seen = new Map<TrashType, string>();
    for (const i of items) if (!seen.has(i.type)) seen.set(i.type, i.typeLabel);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (type && i.type !== type) return false;
      if (needle && !`${i.label} ${i.sublabel ?? ""} ${i.deletedByName ?? ""}`.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [items, type, q]);

  async function restore(it: TrashItem) {
    const key = it.type + it.id;
    setBusy(key);
    try {
      const res = await restoreItem(it.type, it.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${it.typeLabel} restored`);
      setDetail(null);
      router.refresh();
    } catch {
      toast.error("Couldn't restore this item.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Combobox
            options={typeOptions}
            value={type}
            onChange={setType}
            placeholder="All types"
            emptyLabel="All types"
            searchPlaceholder="Filter type…"
          />
        </div>
        <div className="min-w-56 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trash…" />
        </div>
        <p className="shrink-0 text-sm text-muted">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <Card className="px-5 py-16 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-canvas text-faint">
            <Icon name="trash" className="size-6" />
          </span>
          <h2 className="text-lg font-semibold text-content">
            {items.length === 0 ? "Trash is empty" : "Nothing matches"}
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {items.length === 0
              ? "Deleted items will appear here, ready to restore."
              : "Try a different type or clear the search."}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {filtered.map((it) => {
            const key = it.type + it.id;
            return (
              <div
                key={key}
                onClick={() => setDetail(it)}
                className="flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-canvas"
              >
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    restore(it);
                  }}
                  disabled={busy === key}
                  className="shrink-0 rounded-lg bg-canvas px-3 py-1.5 text-sm font-medium text-accent-strong ring-1 ring-inset ring-line transition-colors hover:bg-surface disabled:opacity-50"
                >
                  {busy === key ? "Restoring…" : "Restore"}
                </button>
              </div>
            );
          })}
        </Card>
      )}

      {detail && (
        <TrashDetailModal
          item={detail}
          onClose={() => setDetail(null)}
          onRestore={() => restore(detail)}
          restoring={busy === detail.type + detail.id}
        />
      )}
    </div>
  );
}
