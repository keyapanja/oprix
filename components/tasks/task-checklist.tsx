"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import { toggleChecklistItem, addChecklistItem, removeChecklistItem } from "@/lib/projects/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type Item = { id: string; text: string; isDone: boolean };

export function TaskChecklist({
  taskId,
  initial,
  canEdit,
}: {
  taskId: string;
  initial: Item[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [text, setText] = useState("");
  const [, start] = useTransition();
  const done = items.filter((i) => i.isDone).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  function toggle(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next = !item.isDone;
    setItems((is) => is.map((i) => (i.id === id ? { ...i, isDone: next } : i)));
    start(async () => {
      const res = await toggleChecklistItem(id, next);
      if (res.error) {
        setItems((is) => is.map((i) => (i.id === id ? { ...i, isDone: !next } : i)));
        toast.error(res.error);
      }
    });
  }
  function add() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      const res = await addChecklistItem(taskId, t);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.item) setItems((is) => [...is, res.item!]);
      setText("");
    });
  }
  function remove(id: string) {
    const prev = items;
    setItems((is) => is.filter((i) => i.id !== id));
    start(async () => {
      const res = await removeChecklistItem(id);
      if (res.error) {
        setItems(prev);
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
            <div className="gradient-brand h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-muted">{done}/{items.length}</span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted">No checklist items.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-canvas">
              <input
                type="checkbox"
                checked={it.isDone}
                disabled={!canEdit}
                onChange={() => toggle(it.id)}
                className="size-4 rounded border-line-strong text-brand-600 focus:ring-brand-500 disabled:opacity-50"
              />
              <span className={cn("flex-1 text-sm", it.isDone ? "text-faint line-through" : "text-content")}>
                {it.text}
              </span>
              {canEdit && (
                <button
                  onClick={() => remove(it.id)}
                  className="text-faint opacity-0 hover:text-red-600 group-hover:opacity-100"
                  aria-label="Remove item"
                >
                  <Icon name="trash" className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add an item…"
          />
          <Button size="sm" onClick={add} disabled={!text.trim()}>Add</Button>
        </div>
      )}
    </div>
  );
}
