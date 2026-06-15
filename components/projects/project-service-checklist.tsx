"use client";

import { toast } from "@/components/ui/toast";
import { useState, useTransition } from "react";
import {
  addProjectServiceChecklistItem,
  removeProjectServiceChecklistItem,
} from "@/lib/projects/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

type Item = { id: string; text: string };

export function ProjectServiceChecklist({
  projectServiceId,
  initial,
  onCountChange,
}: {
  projectServiceId: string;
  initial: Item[];
  onCountChange?: (n: number) => void;
}) {
  const [items, setItems] = useState<Item[]>(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function commit(next: Item[]) {
    setItems(next);
    onCountChange?.(next.length);
  }

  function add() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      const res = await addProjectServiceChecklistItem(projectServiceId, t);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.item) commit([...items, res.item]);
      setText("");
    });
  }
  function remove(id: string) {
    const prev = items;
    commit(items.filter((x) => x.id !== id));
    start(async () => {
      const res = await removeProjectServiceChecklistItem(id);
      if (res.error) {
        commit(prev);
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted">
        Copied onto new tasks created for this service in this project. Seeded from the
        service default — edits here stay specific to this project.
      </p>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted">
          No checklist items yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-content">
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
