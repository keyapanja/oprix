"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSubcategories, renameService } from "@/lib/org/actions";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { DeleteButton } from "@/components/org/delete-button";
import { ServiceChecklistEditor } from "@/components/org/service-checklist-editor";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";

type Node = {
  id: string;
  name: string;
  parentId: string | null;
  departmentName: string | null;
  checklist: { id: string; text: string }[];
};

function ChecklistButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1 text-xs font-medium text-content hover:bg-accent-soft hover:text-accent-strong"
    >
      <Icon name="check" className="size-3.5" />
      {count} item{count === 1 ? "" : "s"}
    </button>
  );
}

/** A small pencil button that turns a name into an editable field. */
function RenameButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-faint transition-colors hover:text-accent-strong"
      aria-label={`Rename ${label}`}
      title="Rename"
    >
      <Icon name="pencil" className="size-3.5" />
    </button>
  );
}

/** Inline rename input: Enter to save, Esc to cancel. Mounts focused. */
function RenameField({
  value,
  onSave,
  onCancel,
  pending,
}: {
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [v, setV] = useState(value);
  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        value={v}
        disabled={pending}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave(v);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="h-7 w-52 rounded-lg bg-surface px-2.5 text-sm text-content ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
      />
      <button
        onClick={() => onSave(v)}
        disabled={pending}
        className="text-accent-strong hover:text-accent disabled:opacity-50"
        aria-label="Save name"
      >
        <Icon name="check" className="size-4" />
      </button>
      <button onClick={onCancel} className="text-faint hover:text-content" aria-label="Cancel rename">
        <Icon name="x" className="size-4" />
      </button>
    </span>
  );
}

export function ServiceList({ services }: { services: Node[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Node | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const categories = services.filter((s) => !s.parentId);
  const childrenOf = (id: string) => services.filter((s) => s.parentId === id);
  const orphans = services.filter((s) => s.parentId && !categories.some((c) => c.id === s.parentId));

  function toggleCollapse(id: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleSelectAll(kids: Node[]) {
    const ids = kids.map((k) => k.id);
    const allSel = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (allSel ? n.delete(id) : n.add(id)));
      return n;
    });
  }

  function doRename(id: string, raw: string) {
    const name = raw.trim();
    if (!name) {
      toast.error("Name can't be empty");
      return;
    }
    start(async () => {
      try {
        const res = await renameService(id, name);
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Renamed");
        setRenaming(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't rename.");
      }
    });
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirmDialog({
      message: `Delete ${ids.length} sub-categor${ids.length === 1 ? "y" : "ies"}? This can't be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    start(async () => {
      try {
        const res = await deleteSubcategories(ids);
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        const deleted = res.deleted ?? 0;
        const skipped = res.skipped ?? 0;
        toast.success(
          `Deleted ${deleted} sub-categor${deleted === 1 ? "y" : "ies"}` +
            (skipped ? ` · ${skipped} in use, skipped` : ""),
        );
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the sub-categories.");
      }
    });
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-elevated px-4 py-2.5 shadow-card-hover">
          <span className="text-sm font-medium text-content">
            {selected.size} sub-categor{selected.size === 1 ? "y" : "ies"} selected
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
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              <Icon name="trash" className="size-4" />
              {pending ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        </div>
      )}

      <Card>
        {categories.length === 0 && orphans.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No categories yet. Add one above.</p>
        ) : (
          <ul className="divide-y divide-line">
            {categories.map((cat) => {
              const kids = childrenOf(cat.id);
              const isCollapsed = collapsed.has(cat.id);
              const allSel = kids.length > 0 && kids.every((k) => selected.has(k.id));
              return (
                <li key={cat.id} className="px-5 py-3.5">
                  {/* Category header — click to collapse/expand */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {renaming === cat.id ? (
                      <div className="flex items-center gap-2">
                        <Icon
                          name="chevronDown"
                          className={cn("size-4 shrink-0 text-faint", isCollapsed && "-rotate-90")}
                        />
                        <Icon name="folder" className="size-4 shrink-0 text-accent-strong" />
                        <RenameField
                          value={cat.name}
                          onSave={(v) => doRename(cat.id, v)}
                          onCancel={() => setRenaming(null)}
                          pending={pending}
                        />
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => toggleCollapse(cat.id)}
                          className="flex items-center gap-2 text-left"
                          aria-expanded={!isCollapsed}
                        >
                          <Icon
                            name="chevronDown"
                            className={cn("size-4 shrink-0 text-faint transition-transform", isCollapsed && "-rotate-90")}
                          />
                          <Icon name="folder" className="size-4 shrink-0 text-accent-strong" />
                          <span className="font-semibold text-content">{cat.name}</span>
                        </button>
                        <RenameButton label={cat.name} onClick={() => setRenaming(cat.id)} />
                      </>
                    )}
                    <span className="rounded bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                      {cat.departmentName ?? "No department"}
                    </span>
                    <span className="text-xs text-faint">
                      {kids.length} sub-categor{kids.length === 1 ? "y" : "ies"}
                    </span>
                    <span className="ml-auto flex items-center gap-3">
                      {kids.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={allSel}
                            onChange={() => toggleSelectAll(kids)}
                            className="size-3.5 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                          />
                          Select all
                        </label>
                      )}
                      <DeleteButton entity="service" id={cat.id} label={cat.name} />
                    </span>
                  </div>

                  {/* Sub-categories */}
                  {!isCollapsed &&
                    (kids.length > 0 ? (
                      <ul className="mt-2 ml-2 space-y-0.5 border-l border-line pl-4">
                        {kids.map((sub) => (
                          <li
                            key={sub.id}
                            className={cn(
                              "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg py-1.5 pl-1 pr-1 hover:bg-canvas",
                              selected.has(sub.id) && "bg-accent-soft hover:bg-accent-soft",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(sub.id)}
                              onChange={() => toggleSelect(sub.id)}
                              className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                              aria-label={`Select ${sub.name}`}
                            />
                            {renaming === sub.id ? (
                              <RenameField
                                value={sub.name}
                                onSave={(v) => doRename(sub.id, v)}
                                onCancel={() => setRenaming(null)}
                                pending={pending}
                              />
                            ) : (
                              <>
                                <span className="text-sm text-content">{sub.name}</span>
                                <RenameButton label={sub.name} onClick={() => setRenaming(sub.id)} />
                              </>
                            )}
                            <ChecklistButton count={sub.checklist.length} onClick={() => setEditing(sub)} />
                            <span className="ml-auto">
                              <DeleteButton entity="service" id={sub.id} label={sub.name} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 ml-6 text-xs text-faint">No sub-categories yet.</p>
                    ))}
                </li>
              );
            })}

            {orphans.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggleSelect(o.id)}
                  className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
                  aria-label={`Select ${o.name}`}
                />
                {renaming === o.id ? (
                  <RenameField
                    value={o.name}
                    onSave={(v) => doRename(o.id, v)}
                    onCancel={() => setRenaming(null)}
                    pending={pending}
                  />
                ) : (
                  <>
                    <span className="text-sm text-content">{o.name}</span>
                    <RenameButton label={o.name} onClick={() => setRenaming(o.id)} />
                  </>
                )}
                <span className="text-xs text-faint">(no category)</span>
                <ChecklistButton count={o.checklist.length} onClick={() => setEditing(o)} />
                <span className="ml-auto">
                  <DeleteButton entity="service" id={o.id} label={o.name} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <Modal
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
          title={`${editing.name} · checklist`}
        >
          <ServiceChecklistEditor serviceId={editing.id} initial={editing.checklist} />
        </Modal>
      )}
    </>
  );
}
