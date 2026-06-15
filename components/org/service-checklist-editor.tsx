"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import { addServiceChecklistItem, removeServiceChecklistItem } from "@/lib/org/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

type Item = { id: string; text: string };

export function ServiceChecklistEditor({
  serviceId,
  initial,
}: {
  serviceId: string;
  initial: Item[];
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function add() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      const res = await addServiceChecklistItem(serviceId, t);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.item) setItems((i) => [...i, res.item!]);
      setText("");
    });
  }
  function remove(id: string) {
    const prev = items;
    setItems((i) => i.filter((x) => x.id !== id));
    start(async () => {
      const res = await removeServiceChecklistItem(id);
      if (res.error) {
        setItems(prev);
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        These items are copied onto every task created with this service. Assignees can
        then tick or edit them per task.
      </p>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-sm text-muted">
          No checklist items yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-content">
              <Icon name="check" className="size-4 text-faint" />
              <span className="flex-1">{it.text}</span>
              <button onClick={() => remove(it.id)} className="text-faint hover:text-red-600" aria-label="Remove item">
                <Icon name="trash" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a checklist item…"
        />
        <Button onClick={add} disabled={pending || !text.trim()}>Add</Button>
      </div>
    </div>
  );
}
